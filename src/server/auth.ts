/**
 * HCM Lite - Server Authentication & Token Management
 * Implements bcrypt cost 12, JWT 15-min access tokens, hashed revocable refresh tokens,
 * login lockout reset, and random temporary passwords.
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { SqliteDb } from './db.js';

function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set to at least 32 random characters.');
  }
  return secret;
}

// Explicitly typed as string so TypeScript can safely pass it to jsonwebtoken.
const JWT_SECRET: string = requireJwtSecret();
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_DAYS = 7;
const LOCKOUT_MINUTES = 15;
const MAX_FAILED_ATTEMPTS = 5;

export interface TokenPayload {
  userId: string;
  username: string;
  role: string;
  employeeId: string | null;
  mustChangePassword: boolean;
  tokenVersion?: number;
}

export interface SanitizedUser {
  id: string;
  username: string;
  email: string | null;
  role: string;
  employee_id: string | null;
  is_active: boolean;
  is_system_default: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export function sanitizeUser(user: any): SanitizedUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email ?? null,
    role: user.role,
    employee_id: user.employee_id ?? null,
    is_active: Boolean(user.is_active),
    is_system_default: Boolean(user.is_system_default),
    must_change_password: Boolean(user.must_change_password),
    last_login_at: user.last_login_at ?? null,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

export function generateRandomPassword(length = 12): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const specials = '!@#$%^&*';

  let pwd = [
    upper[crypto.randomInt(upper.length)],
    lower[crypto.randomInt(lower.length)],
    digits[crypto.randomInt(digits.length)],
    specials[crypto.randomInt(specials.length)],
  ];

  const all = upper + lower + digits + specials;
  for (let i = pwd.length; i < length; i++) {
    pwd.push(all[crypto.randomInt(all.length)]);
  }

  // Shuffle
  for (let i = pwd.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [pwd[i], pwd[j]] = [pwd[j], pwd[i]];
  }

  return pwd.join('');
}

export async function generateUniqueUsername(firstName: string, lastName: string, db: SqliteDb): Promise<string> {
  const cleanFirst = (firstName || 'user').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanLast = (lastName || 'emp').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

  let base = `${cleanFirst}.${cleanLast}`;
  if (!base || base === '.' || base.length < 3) {
    base = `emp.${crypto.randomBytes(3).toString('hex')}`;
  }

  let username = base;
  let counter = 1;

  while (true) {
    const existing = (await db.queryOne('SELECT id FROM users WHERE username = ?', [username]));
    if (!existing) {
      return username;
    }
    counter++;
    username = `${base}${counter}`;
  }
}

export function createAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

export function verifyAccessToken(token: string): TokenPayload {
  // jwt.verify checks the signature and expiration. Validate our custom claims too.
  const decoded = jwt.verify(token, JWT_SECRET);
  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    typeof decoded.userId !== 'string' ||
    typeof decoded.username !== 'string' ||
    typeof decoded.role !== 'string' ||
    !(decoded.employeeId === null || typeof decoded.employeeId === 'string') ||
    typeof decoded.mustChangePassword !== 'boolean' ||
    (decoded.tokenVersion !== undefined &&
      (typeof decoded.tokenVersion !== 'number' || !Number.isInteger(decoded.tokenVersion)))
  ) {
    throw new jwt.JsonWebTokenError('Invalid access token payload');
  }

  return {
    userId: decoded.userId,
    username: decoded.username,
    role: decoded.role,
    employeeId: decoded.employeeId,
    mustChangePassword: decoded.mustChangePassword,
    tokenVersion: decoded.tokenVersion,
  };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createRefreshToken(userId: string, db: SqliteDb): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const id = `rt-${crypto.randomBytes(8).toString('hex')}`;

  const expiresDate = new Date();
  expiresDate.setDate(expiresDate.getDate() + REFRESH_TOKEN_DAYS);

  (await db.run(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, revoked_at, created_at)
     VALUES (?, ?, ?, ?, NULL, ?)`,
    [id, userId, tokenHash, expiresDate.toISOString(), new Date().toISOString()]
  ));

  return rawToken;
}

export async function revokeAllUserRefreshTokens(userId: string, db: SqliteDb): Promise<void> {
  const now = new Date().toISOString();
  (await db.run(`UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`, [now, userId]));
}

export async function revokeSingleRefreshToken(rawToken: string, db: SqliteDb): Promise<void> {
  const tokenHash = hashToken(rawToken);
  const now = new Date().toISOString();
  (await db.run(`UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL`, [now, tokenHash]));
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export interface LoginResult {
  success: boolean;
  genericError?: string;
  user?: SanitizedUser;
  accessToken?: string;
  refreshToken?: string;
}

export async function processLogin(
  identifier: string,
  password: string,
  db: SqliteDb,
  ip = '127.0.0.1'
): Promise<LoginResult> {
  const genericError = 'Invalid credentials or account temporarily locked.';
  const now = new Date();
  const nowIso = now.toISOString();

  const user = (await db.queryOne<any>(
    'SELECT * FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)',
    [identifier.trim(), identifier.trim()]
  ));

  if (!user) {
    // Artificial delay to prevent timing attacks
    await bcrypt.compare(password, '$2a$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy');
    return { success: false, genericError };
  }

  // Check lockout
  if (user.locked_until) {
    const lockedDate = new Date(user.locked_until);
    if (lockedDate > now) {
      // Still locked
      return { success: false, genericError };
    } else {
      // Lock expired: reset failed_attempts and locked_until per Section 2.1
      (await db.run('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?', [user.id]));
      user.failed_attempts = 0;
      user.locked_until = null;
    }
  }

  // Check active status
  if (!user.is_active) {
    return { success: false, genericError };
  }

  // Verify password
  const isMatch = await comparePassword(password, user.password_hash);
  if (!isMatch) {
    const newFailedAttempts = (user.failed_attempts || 0) + 1;
    let newLockedUntil: string | null = null;

    if (newFailedAttempts >= MAX_FAILED_ATTEMPTS) {
      const lockUntilDate = new Date(now.getTime() + LOCKOUT_MINUTES * 60 * 1000);
      newLockedUntil = lockUntilDate.toISOString();
    }

    (await db.run(
      'UPDATE users SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?',
      [newFailedAttempts, newLockedUntil, nowIso, user.id]
    ));

    return { success: false, genericError };
  }

  // Reset failed attempts upon successful login
  (await db.run(
    'UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?',
    [nowIso, nowIso, user.id]
  ));

  const payload: TokenPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    employeeId: user.employee_id,
    mustChangePassword: Boolean(user.must_change_password),
    tokenVersion: user.token_version ?? 0,
  };

  const accessToken = createAccessToken(payload);
  const refreshToken = (await createRefreshToken(user.id, db));

  // Audit log
  (await db.run(
    `INSERT INTO audit_logs (id, actor_id, actor_role, action, entity, entity_id, before_json, after_json, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      `aud-login-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      user.id,
      user.role,
      'USER_LOGIN',
      'user',
      user.id,
      null,
      JSON.stringify({ username: user.username }),
      ip,
      nowIso,
    ]
  ));

  return {
    success: true,
    user: sanitizeUser(user),
    accessToken,
    refreshToken,
  };
}
