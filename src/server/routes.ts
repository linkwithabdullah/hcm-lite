/**
 * HCM Lite - REST API Routes & Middlewares
 * Mounts on /api/v1/*
 */

import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { SqliteDb, serverDb } from './db.js';
import {
  comparePassword,
  createAccessToken,
  createRefreshToken,
  generateRandomPassword,
  generateUniqueUsername,
  hashPassword,
  hashToken,
  processLogin,
  revokeAllUserRefreshTokens,
  revokeSingleRefreshToken,
  sanitizeUser,
  verifyAccessToken,
} from './auth.js';
import {
  calculateHaversineDistance,
  computeEmployeePayroll,
  countWorkingDays,
  countWorkingDaysByYear,
  evaluateCheckInStatus,
  evaluateCheckOutStatus,
  getMonthWorkingDays,
  isWorkingDay,
  validatePassword,
} from './rules.js';
import { ServerAiService } from './ai.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: string;
    employee_id: string | null;
    must_change_password: boolean;
  };
  db?: SqliteDb;
}

function validIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;
}
function safeName(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 100 && /^[\p{L}\p{M} '\-]+$/u.test(value.trim());
}
function safeText(value: unknown, max = 500): boolean {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max && !/[<>]/.test(value);
}
function validEmail(value: unknown): boolean {
  return typeof value === 'string' && value.length <= 255 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
}
function validSalary(value: unknown): boolean {
  const v=Number(value);
  return value !== null && value !== undefined && value !== '' && Number.isFinite(v) && v > 0 && v <= 1000000000 && /^\d+(?:\.\d{1,2})?$/.test(String(value));
}

export function createApiRouter(customDb?: SqliteDb): express.Router {
  const router = express.Router();
  // Catch thrown errors from async handlers on Express 4.
  for (const verb of ['get','post','put','patch','delete'] as const) {
    const original = (router as any)[verb].bind(router);
    (router as any)[verb] = (path: string, ...handlers: any[]) => original(path, ...handlers.map((handler: any) =>
      (req: Request, res: Response, next: NextFunction) => Promise.resolve().then(() => handler(req, res, next)).catch(next)
    ));
  }
  const db = customDb || serverDb;

  // Database injection middleware
  router.use((req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    req.db = db;
    next();
  });

  // -------------------------------------------------------------
  // Authentication Middleware
  // -------------------------------------------------------------
  const authenticateToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required. Missing Bearer token.' },
      });
    }

    const token = authHeader.split(' ')[1];
    try {
      const payload = verifyAccessToken(token);
      const user = (await db.queryOne<any>('SELECT * FROM users WHERE id = ?', [payload.userId]));
      if (!user || !user.is_active || Number(payload.tokenVersion ?? 0) !== Number(user.token_version ?? 0)) {
        return res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'User account not found or deactivated.' },
        });
      }

      req.user = {
        id: user.id,
        username: user.username,
        role: user.role,
        employee_id: user.employee_id,
        must_change_password: Boolean(user.must_change_password),
      };
      next();
    } catch (err) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired access token.' },
      });
    }
  };

  // -------------------------------------------------------------
  // Password Change Gate Middleware
  // -------------------------------------------------------------
  const requirePasswordChangeGate = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (req.user && req.user.must_change_password) {
      // Allowed routes: change-password, logout, me
      const path = req.path;
      if (
        path === '/auth/change-password' ||
        path === '/auth/logout' ||
        path === '/auth/me'
      ) {
        return next();
      }

      return res.status(403).json({
        error: {
          code: 'PASSWORD_CHANGE_REQUIRED',
          message: 'You must change your password before accessing system features.',
        },
      });
    }
    next();
  };

  // -------------------------------------------------------------
  // Role Guards
  // -------------------------------------------------------------
  const requireRole = (...roles: string[]) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
      }
      if (req.user.role === 'SUPERADMIN' || roles.includes(req.user.role)) {
        return next();
      }
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Insufficient role permissions for this resource.' },
      });
    };
  };

  // =============================================================
  // AUTH ROUTES
  // =============================================================

  // POST /auth/login
  router.post('/auth/login', async (req: AuthenticatedRequest, res: Response) => {
    const { identifier, password } = req.body || {};
    if (!identifier || !password) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'Username and password are required.' },
      });
    }

    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    // Shared Postgres-backed IP throttle (works across serverless instances).
    const since = new Date(Date.now() - 15 * 60000).toISOString();
    await db.run('DELETE FROM login_rate_limits WHERE created_at < ?', [since]);
    const attempts = await db.queryOne<{count:number}>('SELECT count(*) AS count FROM login_rate_limits WHERE ip = ? AND created_at >= ?', [ip,since]);
    if (Number(attempts?.count||0) >= 20) {
      return res.status(429).json({error:{code:'TOO_MANY_LOGIN_ATTEMPTS',message:'Too many login attempts. Try again later.'}});
    }
    await db.run('INSERT INTO login_rate_limits (id,ip,created_at) VALUES (?,?,?)',
      [`la-${crypto.randomBytes(8).toString('hex')}`, ip,new Date().toISOString()]);
    const result = await processLogin(identifier, password, db, ip);

    if (!result.success) {
      return res.status(401).json({
        error: { code: 'INVALID_CREDENTIALS', message: result.genericError },
      });
    }

    return res.status(200).json({
      data: {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user,
      },
    });
  });

  // POST /auth/refresh
  router.post('/auth/refresh', async (req: AuthenticatedRequest, res: Response) => {
    const { refreshToken } = req.body || {};
    if (!refreshToken) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'Refresh token is required.' },
      });
    }

    const tokenHash = hashToken(refreshToken);
    const stored = (await db.queryOne<any>(
      'SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked_at IS NULL',
      [tokenHash]
    ));

    if (!stored || new Date(stored.expires_at) < new Date()) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired refresh token.' },
      });
    }

    const user = (await db.queryOne<any>('SELECT * FROM users WHERE id = ?', [stored.user_id]));
    if (!user || !user.is_active) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'User account not active.' },
      });
    }

    // Revoke old token and issue new token pair (refresh rotation)
    (await revokeSingleRefreshToken(refreshToken, db));
    const newRefreshToken = (await createRefreshToken(user.id, db));
    const newAccessToken = createAccessToken({
      userId: user.id,
      username: user.username,
      role: user.role,
      employeeId: user.employee_id,
      mustChangePassword: Boolean(user.must_change_password),
      tokenVersion: user.token_version ?? 0,
    });

    return res.status(200).json({
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        user: sanitizeUser(user),
      },
    });
  });

  // POST /auth/logout
  router.post('/auth/logout', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    const { refreshToken } = req.body || {};
    if (refreshToken) {
      (await revokeSingleRefreshToken(refreshToken, db));
    }
    return res.status(200).json({ data: { message: 'Logged out successfully.' } });
  });

  // GET /auth/me
  router.get('/auth/me', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    const user = (await db.queryOne<any>('SELECT * FROM users WHERE id = ?', [req.user!.id]));
    if (!user) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found.' } });
    }
    return res.status(200).json({ data: { user: sanitizeUser(user) } });
  });

  // POST /auth/change-password
  router.post('/auth/change-password', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    const { currentPassword, newPassword } = req.body || {};
    const user = (await db.queryOne<any>('SELECT * FROM users WHERE id = ?', [req.user!.id]));
    if (!user) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found.' } });
    }

    // Verify current password
    const isMatch = await comparePassword(currentPassword || '', user.password_hash);
    if (!isMatch) {
      return res.status(400).json({
        error: { code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect.' },
      });
    }

    // Validate new password rules
    const val = validatePassword(newPassword, user.username, currentPassword);
    if (!val.isValid) {
      return res.status(400).json({
        error: {
          code: 'WEAK_PASSWORD',
          message: val.errors[0],
          fields: val.errors.map((e) => ({ field: 'newPassword', reason: e })),
        },
      });
    }

    const newHash = await hashPassword(newPassword);
    const nowIso = new Date().toISOString();

    (await db.run(
      'UPDATE users SET password_hash = ?, must_change_password = 0, token_version = token_version + 1, updated_at = ? WHERE id = ?',
      [newHash, nowIso, user.id]
    ));

    // Revoke all refresh tokens on password change
    (await revokeAllUserRefreshTokens(user.id, db));

    // Issue new tokens
    const newAccessToken = createAccessToken({
      userId: user.id,
      username: user.username,
      role: user.role,
      employeeId: user.employee_id,
      mustChangePassword: false,
      tokenVersion: Number(user.token_version ?? 0) + 1,
    });
    const newRefreshToken = (await createRefreshToken(user.id, db));

    // Audit log
    (await db.run(
      `INSERT INTO audit_logs (id, actor_id, actor_role, action, entity, entity_id, before_json, after_json, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `aud-pw-${Date.now()}`,
        user.id,
        user.role,
        'PASSWORD_CHANGED',
        'user',
        user.id,
        null,
        JSON.stringify({ username: user.username }),
        req.ip || '127.0.0.1',
        nowIso,
      ]
    ));

    return res.status(200).json({
      data: {
        message: 'Password changed successfully.',
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        user: { ...sanitizeUser(user), must_change_password: false },
      },
    });
  });

  // Apply gate middleware to all subsequent routes
  router.use(authenticateToken);
  router.use(requirePasswordChangeGate);

  // =============================================================
  // SETTINGS & ORGANIZATION
  // =============================================================

  // GET /settings
  router.get('/settings', async (req: AuthenticatedRequest, res: Response) => {
    const settings = (await db.queryOne<any>('SELECT * FROM settings WHERE id = ?', ['settings-1']));
    if (!settings) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Settings not initialized.' } });
    }
    return res.status(200).json({
      data: {
        ...settings,
        weekend_days: JSON.parse(settings.weekend_days || '["Sat","Sun"]'),
        late_penalty_enabled: Boolean(settings.late_penalty_enabled),
        setup_complete: Boolean(settings.setup_complete),
      },
    });
  });

  // PUT /settings
  router.put('/settings', requireRole('SUPERADMIN', 'ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
    const {
      office_start,
      grace_minutes,
      half_day_hours,
      weekend_days,
      office_lat,
      office_lng,
      office_radius_m,
      working_hours_per_week,
      late_penalty_enabled,
      timezone,
      company_name,
    } = req.body || {};

    if (company_name !== undefined && !safeText(company_name, 150)) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'A valid company name of up to 150 characters is required.' } });
    }
    const before = (await db.queryOne<any>('SELECT * FROM settings WHERE id = ?', ['settings-1']));
    const nowIso = new Date().toISOString();

    // Bounds validation
    if (office_lat !== null && office_lat !== undefined && (office_lat < -90 || office_lat > 90)) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Latitude must be between -90 and 90.' } });
    }
    if (office_lng !== null && office_lng !== undefined && (office_lng < -180 || office_lng > 180)) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Longitude must be between -180 and 180.' } });
    }
    if (office_radius_m !== undefined && (office_radius_m < 10 || office_radius_m > 5000)) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Radius must be between 10m and 5000m.' } });
    }

    (await db.run(
      `UPDATE settings SET
        office_start = COALESCE(?, office_start),
        grace_minutes = COALESCE(?, grace_minutes),
        half_day_hours = COALESCE(?, half_day_hours),
        weekend_days = COALESCE(?, weekend_days),
        office_lat = ?,
        office_lng = ?,
        office_radius_m = COALESCE(?, office_radius_m),
        working_hours_per_week = COALESCE(?, working_hours_per_week),
        late_penalty_enabled = COALESCE(?, late_penalty_enabled),
        timezone = COALESCE(?, timezone),
        company_name = COALESCE(?, company_name),
        setup_complete = CASE WHEN ?::text IS NOT NULL THEN 1 ELSE setup_complete END,
        updated_by = ?,
        updated_at = ?
       WHERE id = 'settings-1'`,
      [
        office_start,
        grace_minutes,
        half_day_hours,
        weekend_days ? JSON.stringify(weekend_days) : null,
        office_lat !== undefined ? office_lat : before.office_lat,
        office_lng !== undefined ? office_lng : before.office_lng,
        office_radius_m,
        working_hours_per_week,
        late_penalty_enabled !== undefined ? (late_penalty_enabled ? 1 : 0) : null,
        timezone,
        company_name,
        company_name && safeText(company_name, 150) ? company_name : null,
        req.user!.id,
        nowIso,
      ]
    ));

    const updated = (await db.queryOne<any>('SELECT * FROM settings WHERE id = ?', ['settings-1']));

    // Audit log
    (await db.run(
      `INSERT INTO audit_logs (id, actor_id, actor_role, action, entity, entity_id, before_json, after_json, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `aud-set-${Date.now()}`,
        req.user!.id,
        req.user!.role,
        'SETTINGS_UPDATED',
        'settings',
        'settings-1',
        JSON.stringify(before),
        JSON.stringify(updated),
        req.ip || '127.0.0.1',
        nowIso,
      ]
    ));

    return res.status(200).json({
      data: {
        ...updated,
        weekend_days: JSON.parse(updated.weekend_days || '["Sat","Sun"]'),
        late_penalty_enabled: Boolean(updated.late_penalty_enabled),
      },
    });
  });

  // =============================================================
  // DEPARTMENTS & DESIGNATIONS & HOLIDAYS & LEAVE TYPES
  // =============================================================

  // Departments
  router.get('/departments', async (_req: AuthenticatedRequest, res: Response) => {
    const list = (await db.query<any>('SELECT * FROM departments ORDER BY name ASC'));
    return res.status(200).json({ data: list });
  });

  router.post('/departments', requireRole('SUPERADMIN', 'ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
    const { name } = req.body || {};
    if (!safeText(name, 100)) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Department name is required.' } });
    }
    const cleanName = name.trim();
    const existing = (await db.queryOne('SELECT id FROM departments WHERE LOWER(name) = LOWER(?)', [cleanName]));
    if (existing) {
      return res.status(409).json({ error: { code: 'CONFLICT', message: 'Department already exists.' } });
    }
    const id = `dept-${crypto.randomBytes(4).toString('hex')}`;
    (await db.run('INSERT INTO departments (id, name, is_active) VALUES (?, ?, 1)', [id, cleanName]));
    return res.status(201).json({ data: { id, name: cleanName, is_active: true } });
  });

  // Designations
  router.get('/designations', async (_req: AuthenticatedRequest, res: Response) => {
    const list = (await db.query<any>('SELECT * FROM designations ORDER BY title ASC'));
    return res.status(200).json({ data: list });
  });

  router.post('/designations', requireRole('SUPERADMIN', 'ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
    const { title, department_id } = req.body || {};
    if (!safeText(title, 100)) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Designation title is required.' } });
    }
    const id = `des-${crypto.randomBytes(4).toString('hex')}`;
    (await db.run('INSERT INTO designations (id, title, department_id, is_active) VALUES (?, ?, ?, 1)', [
      id,
      title.trim(),
      department_id || null,
    ]));
    return res.status(201).json({ data: { id, title: title.trim(), department_id: department_id || null, is_active: true } });
  });

  // Holidays
  router.get('/holidays', async (_req: AuthenticatedRequest, res: Response) => {
    const list = (await db.query<any>('SELECT * FROM holidays ORDER BY date ASC'));
    return res.status(200).json({ data: list });
  });

  router.post('/holidays', requireRole('SUPERADMIN', 'ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
    const { date, name } = req.body || {};
    if (!date || !safeText(name, 100)) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Date and name are required for holiday.' } });
    }
    if (!validIsoDate(date)) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid holiday date format. Expected YYYY-MM-DD.' } });
    }
    const id = `hol-${crypto.randomBytes(4).toString('hex')}`;
    try {
      (await db.run('INSERT INTO holidays (id, date, name) VALUES (?, ?, ?)', [id, date, name.trim()]));
      return res.status(201).json({ data: { id, date, name: name.trim() } });
    } catch (err: any) {
      return res.status(409).json({ error: { code: 'CONFLICT', message: 'Holiday on that date already exists.' } });
    }
  });

  // Leave Types
  router.get('/leave-types', async (_req: AuthenticatedRequest, res: Response) => {
    const list = (await db.query<any>('SELECT * FROM leave_types ORDER BY name ASC'));
    return res.status(200).json({ data: list.map((l) => ({ ...l, is_paid: Boolean(l.is_paid) })) });
  });

  router.post('/leave-types', requireRole('SUPERADMIN', 'ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
    const { name, yearly_quota, is_paid } = req.body || {};
    if (!safeText(name, 100)) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Leave type name is required.' } });
    }
    const id = `lt-${name.trim().toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    try {
      (await db.run('INSERT INTO leave_types (id, name, yearly_quota, is_paid) VALUES (?, ?, ?, ?)', [
        id,
        name.trim(),
        yearly_quota !== undefined ? yearly_quota : null,
        is_paid !== undefined ? (is_paid ? 1 : 0) : 1,
      ]));
      return res.status(201).json({ data: { id, name: name.trim(), yearly_quota, is_paid: Boolean(is_paid) } });
    } catch (e) {
      return res.status(409).json({ error: { code: 'CONFLICT', message: 'Leave type already exists.' } });
    }
  });

  // =============================================================
  // EMPLOYEES
  // =============================================================

  // GET /employees
  router.get('/employees', async (req: AuthenticatedRequest, res: Response) => {
    const isHrOrAdmin = ['SUPERADMIN', 'ADMIN', 'HR'].includes(req.user!.role);
    // Employees can only read their own profile; HR/Admin can see the directory.
    const employees = (await db.query<any>(
      `SELECT e.*, d.name as department_name, des.title as designation_title, ss.basic_cents
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN designations des ON des.id = e.designation_id
       LEFT JOIN salary_structures ss ON ss.employee_id = e.id
       WHERE (? = 1 OR e.id = ?)
       ORDER BY e.code ASC`, [isHrOrAdmin ? 1 : 0, req.user!.employee_id || '']
    ));

    const sanitized = employees.map((e) => {
      const basic = e.basic_cents !== null && e.basic_cents !== undefined ? e.basic_cents / 100 : null;
      return {
        id: e.id,
        code: e.code,
        first_name: e.first_name,
        last_name: e.last_name,
        email: e.email,
        phone: e.phone,
        address: e.address,
        gender: e.gender,
        date_of_birth: e.date_of_birth,
        department_id: e.department_id,
        designation_id: e.designation_id,
        department: e.department_name,
        designation: e.designation_title,
        join_date: e.join_date,
        exit_date: e.exit_date,
        status: e.status,
        manager_id: e.manager_id,
        basic_salary: isHrOrAdmin ? basic : undefined, // Shield salary from normal employees!
        created_at: e.created_at,
        updated_at: e.updated_at,
      };
    });

    return res.status(200).json({ data: sanitized });
  });

  // POST /employees
  router.post('/employees', requireRole('SUPERADMIN', 'ADMIN', 'HR'), async (req: AuthenticatedRequest, res: Response) => {
    const {
      first_name,
      last_name,
      email,
      phone,
      address,
      gender,
      date_of_birth,
      department_id,
      designation_id,
      join_date,
      basic_salary,
    } = req.body || {};

    // Validation per Section 8.1
    if (!safeName(first_name) || !safeName(last_name)) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'First name and last name are required.' } });
    }
    if (!validEmail(email)) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Valid email address is required.' } });
    }
    if (!validSalary(basic_salary)) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Basic salary must be a positive number.' } });
    }

    if (typeof phone !== 'string' || !/^\+?[0-9]{7,15}$/.test(phone.trim().replace(/[ ()-]/g,''))) {
      return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Phone must contain 7–15 digits (optional +).'}});
    }
    if (!safeText(address, 400)) return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'A valid address is required.'}});
    if (!validIsoDate(date_of_birth) || date_of_birth >= new Date().toISOString().slice(0,10)) {
      return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Date of birth must be a real date in the past.'}});
    }
    if (!validIsoDate(join_date)) return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Join date must be YYYY-MM-DD and valid.'}});
    if (!department_id || !(await db.queryOne('SELECT id FROM departments WHERE id = ? AND is_active = 1',[department_id]))) {
      return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Select an existing active department.'}});
    }
    if (!designation_id || !(await db.queryOne('SELECT id FROM designations WHERE id = ? AND is_active = 1 AND (department_id = ? OR department_id IS NULL)',[designation_id,department_id]))) {
      return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Select an existing active designation from the department.'}});
    }

    const cleanEmail = email.trim().toLowerCase();
    const existingEmail = (await db.queryOne('SELECT id FROM employees WHERE LOWER(email) = ?', [cleanEmail]));
    if (existingEmail) {
      return res.status(409).json({ error: { code: 'CONFLICT', message: 'Employee with this email already exists.' } });
    }

    const created = await db.transaction(async () => {
    // Generate code EMP-0001
    const countRow = (await db.queryOne<{ count: number }>('SELECT count(*) as count FROM employees'));
    const nextNum = (countRow ? countRow.count : 0) + 1;
    const code = `EMP-${String(nextNum).padStart(4, '0')}`;

    const empId = `emp-${crypto.randomBytes(6).toString('hex')}`;
    const nowIso = new Date().toISOString();

    // Integer cents for salary
    const basicCents = Math.round(Number(basic_salary) * 100);

    (await db.run(
      `INSERT INTO employees (id, code, first_name, last_name, email, phone, address, gender, date_of_birth, department_id, designation_id, join_date, exit_date, status, manager_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'active', NULL, ?, ?)`,
      [
        empId,
        code,
        first_name.trim(),
        last_name.trim(),
        cleanEmail,
        phone.trim(),
        (address || '').trim(),
        gender || 'other',
        date_of_birth,
        department_id || null,
        designation_id || null,
        join_date,
        nowIso,
        nowIso,
      ]
    ));

    // Save salary structure
    (await db.run(
      `INSERT INTO salary_structures (id, employee_id, basic_cents, effective_from, set_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [`sal-${empId}`, empId, basicCents, join_date, req.user!.id, nowIso]
    ));

    // Generate unique username and random temporary password
    const username = (await generateUniqueUsername(first_name, last_name, db));
    const tempPassword = generateRandomPassword(12);
    const passHash = await hashPassword(tempPassword);

    const userId = `usr-${crypto.randomBytes(6).toString('hex')}`;
    (await db.run(
      `INSERT INTO users (id, username, email, password_hash, role, employee_id, is_active, is_system_default, must_change_password, failed_attempts, locked_until, last_login_at, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'EMPLOYEE', ?, 1, 0, 1, 0, NULL, NULL, ?, ?, ?)`,
      [userId, username, cleanEmail, passHash, empId, req.user!.id, nowIso, nowIso]
    ));

    // Audit log
    (await db.run(
      `INSERT INTO audit_logs (id, actor_id, actor_role, action, entity, entity_id, before_json, after_json, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `aud-emp-${Date.now()}`,
        req.user!.id,
        req.user!.role,
        'EMPLOYEE_CREATED',
        'employee',
        empId,
        null,
        JSON.stringify({ code, name: `${first_name} ${last_name}`, username }),
        req.ip || '127.0.0.1',
        nowIso,
      ]
    ));

    return ({
      data: {
        employee: {
          id: empId,
          code,
          first_name: first_name.trim(),
          last_name: last_name.trim(),
          email: cleanEmail,
          basic_salary: basicCents / 100,
          join_date: join_date,
        },
        credentials: {
          username,
          temporary_password: tempPassword,
          note: 'This temporary password is displayed ONCE. The employee must change it on first login.',
        },
      },
    });
    });
    return res.status(201).json(created);
  });

  // GET /employees/:id
  router.get('/employees/:id', async (req: AuthenticatedRequest, res: Response) => {
    const isHrOrAdmin = ['SUPERADMIN', 'ADMIN', 'HR'].includes(req.user!.role);
    if (!isHrOrAdmin && req.user!.employee_id !== req.params.id) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You can only view your own profile.' } });
    }

    const emp = (await db.queryOne<any>(
      `SELECT e.*, d.name as department_name, des.title as designation_title, ss.basic_cents
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN designations des ON des.id = e.designation_id
       LEFT JOIN salary_structures ss ON ss.employee_id = e.id
       WHERE e.id = ?`,
      [req.params.id]
    ));

    if (!emp) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Employee not found.' } });
    }

    return res.status(200).json({
      data: {
        ...emp,
        basic_cents: isHrOrAdmin ? emp.basic_cents : undefined,
        basic_salary: isHrOrAdmin && emp.basic_cents !== null ? emp.basic_cents / 100 : undefined,
      },
    });
  });

  // PUT /employees/:id/salary
  router.put('/employees/:id/salary', requireRole('SUPERADMIN', 'ADMIN', 'HR'), async (req: AuthenticatedRequest, res: Response) => {
    const { basic_salary } = req.body || {};
    if (!validSalary(basic_salary)) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Basic salary must be a positive number.' } });
    }
    const emp = (await db.queryOne('SELECT id FROM employees WHERE id = ?', [req.params.id]));
    if (!emp) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Employee not found.' } });
    }
    const basicCents = Math.round(Number(basic_salary) * 100);
    const nowIso = new Date().toISOString();
    const existingSal = (await db.queryOne('SELECT id FROM salary_structures WHERE employee_id = ?', [req.params.id]));
    if (existingSal) {
      (await db.run('UPDATE salary_structures SET basic_cents = ?, set_by = ? WHERE employee_id = ?', [
        basicCents,
        req.user!.id,
        req.params.id,
      ]));
    } else {
      (await db.run(
        'INSERT INTO salary_structures (id, employee_id, basic_cents, effective_from, set_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [`sal-${req.params.id}`, req.params.id, basicCents, nowIso.split('T')[0], req.user!.id, nowIso]
      ));
    }
    return res.status(200).json({ data: { employee_id: req.params.id, basic_salary: basicCents / 100 } });
  });

  // POST /employees/import-csv — dry run validates; commit writes real employees and logins.
  router.post('/employees/import-csv', requireRole('SUPERADMIN', 'ADMIN', 'HR'), async (req: AuthenticatedRequest, res: Response) => {
    const { csvContent, dryRun } = req.body || {};
    if (typeof csvContent !== 'string' || csvContent.length > 400000 || !csvContent.trim()) {
      return res.status(400).json({error:{code:'BAD_REQUEST',message:'Provide a CSV file smaller than 400 KB.'}});
    }
    // Handles normal CSV quoted values, escaped quotes and embedded commas.
    const rows: string[][] = []; let cells: string[] = []; let field = ''; let quoted = false;
    for (let i=0; i<csvContent.length; i++) {
      const c=csvContent[i];
      if (c==='"') {if (quoted && csvContent[i+1]==='"') {field+='"'; i++;} else quoted=!quoted;}
      else if (c===',' && !quoted) {cells.push(field.trim()); field='';}
      else if ((c==='\n'||c==='\r') && !quoted) {if(c==='\r'&&csvContent[i+1]==='\n')i++;cells.push(field.trim()); if(cells.some(Boolean))rows.push(cells);cells=[];field='';}
      else field+=c;
    }
    if(quoted) return res.status(400).json({error:{code:'INVALID_CSV',message:'Unclosed CSV quote.'}});
    cells.push(field.trim()); if(cells.some(Boolean))rows.push(cells);
    const header = (rows.shift() || []).map(c=>c.toLowerCase().replace(/^\ufeff/,''));
    const needed=['first_name','last_name','email','phone','department','basic_salary','join_date'];
    const missing=needed.filter(h=>!header.includes(h));
    if(missing.length) return res.status(400).json({error:{code:'INVALID_CSV_HEADER',message:'Required headers missing: '+missing.join(', ')}});
    if(!rows.length) return res.status(400).json({error:{code:'EMPTY_CSV',message:'CSV has no data rows.'}});
    const departments = await db.query<any>('SELECT id,name FROM departments WHERE is_active=1');
    const designations = await db.query<any>('SELECT id,title,department_id FROM designations WHERE is_active=1');
    const existingEmails = await db.query<any>('SELECT LOWER(email) AS email FROM employees');
    const usedEmails = new Set<string>(existingEmails.map(x=>x.email));
    const errors:Array<{row:number,field:string,reason:string}>=[];
    const valid:any[]=[];
    for (const [index,items] of rows.entries()) {
      const row:any = {}; header.forEach((key,j)=>row[key]=items[j]||'');
      const rowNo=index+2;
      const problem=(field:string,reason:string)=>errors.push({row:rowNo,field,reason});
      if(!safeName(row.first_name))problem('first_name','Use a valid name (letters only).');
      if(!safeName(row.last_name))problem('last_name','Use a valid name (letters only).');
      if(!validEmail(row.email)) problem('email','Invalid email.');
      else if(usedEmails.has(row.email.toLowerCase()))problem('email','Duplicate email in database or CSV.');
      if(!validSalary(row.basic_salary)) problem('basic_salary','Salary must be positive with at most two decimals.');
      if(!validIsoDate(row.join_date)) problem('join_date','Must be real YYYY-MM-DD date.');
      if(row.date_of_birth && (!validIsoDate(row.date_of_birth)||row.date_of_birth>=new Date().toISOString().slice(0,10))) problem('date_of_birth','Invalid birth date.');
      if(row.address && !safeText(row.address,400)) problem('address','Invalid address.');
      const dep=departments.find(d=>d.name.toLowerCase()===row.department.toLowerCase() || d.id===row.department);
      if(!dep)problem('department','Department does not exist or is inactive.');
      const des=row.designation ? designations.find(d=>(d.title.toLowerCase()===row.designation.toLowerCase()||d.id===row.designation)&&(!d.department_id||d.department_id===dep?.id)) : null;
      if(row.designation&&!des)problem('designation','Designation not found in department.');
      const phone=(row.phone||'').replace(/[ ()-]/g,'');
      if(!/^\+?[0-9]{7,15}$/.test(phone))problem('phone','7–15 digits required (optional +).');
      if(validEmail(row.email))usedEmails.add(row.email.toLowerCase());
      if(errors.every(e=>e.row!==rowNo)) valid.push({...row,phone,depId:dep.id,desId:des?.id||null});
    }
    if(dryRun) return res.status(200).json({data:{validCount:valid.length,errors}});
    if(errors.length) return res.status(422).json({error:{code:'CSV_ERRORS',message:'Fix all invalid rows before importing.',fields:errors}});
    return db.transaction(async()=>{
      const count = await db.queryOne<{count:number}>('SELECT count(*) as count FROM employees');
      let nextNumber=Number(count?.count||0);
      const credentials:Array<{username:string,temporary_password:string}>=[];
      for(const row of valid) {
        const employeeId=`emp-${crypto.randomBytes(7).toString('hex')}`;
        const now=new Date().toISOString();
        const code=`EMP-${String(++nextNumber).padStart(4,'0')}`;
        await db.run(`INSERT INTO employees (id,code,first_name,last_name,email,phone,address,gender,date_of_birth,department_id,designation_id,join_date,exit_date,status,manager_id,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?, ?,NULL,'active',NULL,?,?)`,[employeeId,code,row.first_name,row.last_name,row.email.toLowerCase(),row.phone,row.address||'',row.gender||'other',row.date_of_birth||'',row.depId,row.desId,row.join_date,now,now]);
        await db.run('INSERT INTO salary_structures (id,employee_id,basic_cents,effective_from,set_by,created_at) VALUES (?,?,?,?,?,?)',
          [`sal-${employeeId}`,employeeId,Math.round(Number(row.basic_salary)*100),row.join_date,req.user!.id,now]);
        const username=await generateUniqueUsername(row.first_name,row.last_name,db);
        const temporary_password=generateRandomPassword();
        const hash=await hashPassword(temporary_password);
        await db.run(`INSERT INTO users (id,username,email,password_hash,role,employee_id,is_active,is_system_default,must_change_password,failed_attempts,locked_until,last_login_at,created_by,created_at,updated_at)
          VALUES (?, ?, ?, ?, 'EMPLOYEE', ?, 1,0,1,0,NULL,NULL,?,?,?)`,[`usr-${crypto.randomBytes(7).toString('hex')}`,username,row.email.toLowerCase(),hash,employeeId,req.user!.id,now,now]);
        credentials.push({username,temporary_password});
      }
      await db.run('INSERT INTO audit_logs (id,actor_id,actor_role,action,entity,entity_id,before_json,after_json,ip,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [`aud-import-${crypto.randomBytes(7).toString('hex')}`,req.user!.id,req.user!.role,'EMPLOYEES_IMPORTED','employees','csv',null,JSON.stringify({count:valid.length}),req.ip||'',new Date().toISOString()]);
      return res.status(201).json({data:{validCount:valid.length,importedCount:valid.length,errors:[],credentials}});
    });
  });

  // =============================================================
  // USERS
  // =============================================================

  // GET /users
  router.get('/users', requireRole('SUPERADMIN', 'ADMIN'), async (_req: AuthenticatedRequest, res: Response) => {
    const list = (await db.query<any>('SELECT * FROM users ORDER BY created_at DESC'));
    return res.status(200).json({ data: list.map(sanitizeUser) });
  });

  // POST /users
  router.post('/users', requireRole('SUPERADMIN', 'ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
    const { username, email, role, employee_id } = req.body || {};
    if (typeof username !== 'string' || !/^[a-z0-9._]{3,50}$/.test(username.trim().toLowerCase())) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Username is required.' } });
    }
    if (!role || !['SUPERADMIN', 'ADMIN', 'HR', 'EMPLOYEE'].includes(role) || (role === 'SUPERADMIN' && req.user!.role !== 'SUPERADMIN')) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid or unauthorized user role.' } });
    }

    if (email && !validEmail(email)) return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'A valid email is required when provided.'}});
    const cleanUsername = username.trim().toLowerCase();
    const existing = (await db.queryOne('SELECT id FROM users WHERE LOWER(username) = ?', [cleanUsername]));
    if (existing) {
      return res.status(409).json({ error: { code: 'CONFLICT', message: 'Username already exists.' } });
    }

    const tempPassword = generateRandomPassword(12);
    const passHash = await hashPassword(tempPassword);
    const id = `usr-${crypto.randomBytes(6).toString('hex')}`;
    const nowIso = new Date().toISOString();

    (await db.run(
      `INSERT INTO users (id, username, email, password_hash, role, employee_id, is_active, is_system_default, must_change_password, failed_attempts, locked_until, last_login_at, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, 0, 1, 0, NULL, NULL, ?, ?, ?)`,
      [id, cleanUsername, email ? email.trim() : null, passHash, role, employee_id || null, req.user!.id, nowIso, nowIso]
    ));

    return res.status(201).json({
      data: {
        user: {
          id,
          username: cleanUsername,
          email: email || null,
          role,
          must_change_password: true,
        },
        credentials: {
          username: cleanUsername,
          temporary_password: tempPassword,
          note: 'This temporary password is displayed ONCE. Please communicate it securely.',
        },
      },
    });
  });

  // PUT /users/:id/deactivate
  router.put('/users/:id/deactivate', requireRole('SUPERADMIN', 'ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
    const target = (await db.queryOne<any>('SELECT * FROM users WHERE id = ?', [req.params.id]));
    if (!target) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found.' } });
    }

    // Last Superadmin Guard (Section 2.2):
    // Cannot deactivate the last active superadmin
    if (target.role === 'SUPERADMIN' && target.is_active) {
      const activeSuperadmins = (await db.queryOne<{ count: number }>(
        "SELECT count(*) as count FROM users WHERE role = 'SUPERADMIN' AND is_active = 1"
      ));
      if (activeSuperadmins && activeSuperadmins.count <= 1) {
        return res.status(409).json({
          error: {
            code: 'LAST_SUPERADMIN_GUARD',
            message: 'Cannot deactivate the system’s sole active Superadmin account.',
          },
        });
      }
    }

    const nowIso = new Date().toISOString();
    (await db.run('UPDATE users SET is_active = 0, token_version = token_version + 1, updated_at = ? WHERE id = ?', [nowIso, target.id]));

    // Revoke all refresh tokens on deactivation
    (await revokeAllUserRefreshTokens(target.id, db));

    // Audit log
    (await db.run(
      `INSERT INTO audit_logs (id, actor_id, actor_role, action, entity, entity_id, before_json, after_json, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `aud-deact-${Date.now()}`,
        req.user!.id,
        req.user!.role,
        'USER_DEACTIVATED',
        'user',
        target.id,
        JSON.stringify({ is_active: target.is_active }),
        JSON.stringify({ is_active: 0 }),
        req.ip || '127.0.0.1',
        nowIso,
      ]
    ));

    return res.status(200).json({ data: { message: `User ${target.username} has been deactivated.` } });
  });

  // PUT /users/:id/activate
  router.put('/users/:id/activate', requireRole('SUPERADMIN', 'ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
    const target = (await db.queryOne<any>('SELECT * FROM users WHERE id = ?', [req.params.id]));
    if (!target) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found.' } });
    }
    const nowIso = new Date().toISOString();
    (await db.run('UPDATE users SET is_active = 1, updated_at = ? WHERE id = ?', [nowIso, target.id]));
    return res.status(200).json({ data: { message: `User ${target.username} has been activated.` } });
  });

  // PUT /users/:id/reset-password
  router.put('/users/:id/reset-password', requireRole('SUPERADMIN', 'ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
    const target = (await db.queryOne<any>('SELECT * FROM users WHERE id = ?', [req.params.id]));
    if (!target) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found.' } });
    }
    const tempPass = generateRandomPassword(12);
    const passHash = await hashPassword(tempPass);
    const nowIso = new Date().toISOString();
    (await db.run(
      'UPDATE users SET password_hash = ?, must_change_password = 1, failed_attempts = 0, locked_until = NULL, token_version = token_version + 1, updated_at = ? WHERE id = ?',
      [passHash, nowIso, target.id]
    ));
    (await revokeAllUserRefreshTokens(target.id, db));
    return res.status(200).json({
      data: {
        temporary_password: tempPass,
        message: 'Password reset successfully. The user must change it upon their next sign in.',
      },
    });
  });

  // =============================================================
  // ATTENDANCE
  // =============================================================

  // POST /attendance/check-in
  router.post('/attendance/check-in', async (req: AuthenticatedRequest, res: Response) => {
    // Identity strictly from token!
    const empId = req.user!.employee_id;
    if (!empId) {
      return res.status(400).json({
        error: { code: 'NO_EMPLOYEE_PROFILE', message: 'Current user has no associated employee profile.' },
      });
    }

    const settings = (await db.queryOne<any>('SELECT * FROM settings WHERE id = ?', ['settings-1']));
    const timezone = settings?.timezone || 'UTC';
    const now = new Date();
    const nowIso = now.toISOString();

    // Format current date in office timezone
    const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);

    // Check if already checked in today (Reject with 409!)
    const existing = (await db.queryOne<any>(
      'SELECT * FROM attendance WHERE employee_id = ? AND date = ?',
      [empId, dateStr]
    ));
    if (existing) {
      return res.status(409).json({
        error: { code: 'ALREADY_CHECKED_IN', message: 'You have already checked in for today.' },
      });
    }

    // Geofencing verification if office lat/lng is configured
    const { lat, lng } = req.body || {};
    let distanceM: number | undefined;
    if (settings?.office_lat !== null && settings?.office_lng !== null && lat && lng) {
      distanceM = calculateHaversineDistance(lat, lng, settings.office_lat, settings.office_lng);
      if (distanceM > settings.office_radius_m) {
        return res.status(400).json({
          error: {
            code: 'OUT_OF_GEOFENCE',
            message: `Check-in location is ${distanceM}m away from the office, exceeding radius of ${settings.office_radius_m}m.`,
          },
        });
      }
    }

    const status = evaluateCheckInStatus(nowIso, settings?.office_start || '09:00', settings?.grace_minutes || 15, timezone);
    const id = `att-${crypto.randomBytes(6).toString('hex')}`;

    (await db.run(
      `INSERT INTO attendance (id, employee_id, date, check_in_at, check_out_at, status, worked_minutes, source, rule_snapshot, lat, lng, distance_m)
       VALUES (?, ?, ?, ?, NULL, ?, 0, 'web', ?, ?, ?, ?)`,
      [
        id,
        empId,
        dateStr,
        nowIso,
        status,
        JSON.stringify({
          office_start: settings?.office_start || '09:00',
          grace_minutes: settings?.grace_minutes || 15,
          half_day_hours: settings?.half_day_hours || 5,
        }),
        lat || null,
        lng || null,
        distanceM || null,
      ]
    ));

    return res.status(201).json({
      data: {
        id,
        date: dateStr,
        check_in_at: nowIso,
        status,
      },
    });
  });

  // POST /attendance/check-out
  router.post('/attendance/check-out', async (req: AuthenticatedRequest, res: Response) => {
    const empId = req.user!.employee_id;
    if (!empId) {
      return res.status(400).json({
        error: { code: 'NO_EMPLOYEE_PROFILE', message: 'Current user has no associated employee profile.' },
      });
    }

    const settings = (await db.queryOne<any>('SELECT * FROM settings WHERE id = ?', ['settings-1']));
    const timezone = settings?.timezone || 'UTC';
    const now = new Date();
    const nowIso = now.toISOString();
    const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);

    const record = (await db.queryOne<any>(
      'SELECT * FROM attendance WHERE employee_id = ? AND date = ?',
      [empId, dateStr]
    ));

    if (!record) {
      return res.status(404).json({
        error: { code: 'NO_CHECK_IN', message: 'No check-in record found for today.' },
      });
    }

    if (record.check_out_at) {
      return res.status(409).json({
        error: { code: 'ALREADY_CHECKED_OUT', message: 'You have already checked out for today.' },
      });
    }

    const { status, workedMinutes } = evaluateCheckOutStatus(
      record.check_in_at,
      nowIso,
      record.status as 'present' | 'late',
      settings?.half_day_hours || 5
    );

    (await db.run(
      'UPDATE attendance SET check_out_at = ?, status = ?, worked_minutes = ? WHERE id = ?',
      [nowIso, status, workedMinutes, record.id]
    ));

    return res.status(200).json({
      data: {
        id: record.id,
        check_in_at: record.check_in_at,
        check_out_at: nowIso,
        status,
        worked_minutes: workedMinutes,
      },
    });
  });

  // GET /attendance/records
  router.get('/attendance/records', async (req: AuthenticatedRequest, res: Response) => {
    const isHrOrAdmin = ['SUPERADMIN', 'ADMIN', 'HR'].includes(req.user!.role);
    let sql = `SELECT a.*, e.code as employee_code, e.first_name, e.last_name, d.name as department_name
               FROM attendance a
               JOIN employees e ON e.id = a.employee_id
               LEFT JOIN departments d ON d.id = e.department_id`;
    const params: any[] = [];

    if (!isHrOrAdmin) {
      sql += ' WHERE a.employee_id = ?';
      params.push(req.user!.employee_id);
    } else if (req.query.employee_id) {
      sql += ' WHERE a.employee_id = ?';
      params.push(req.query.employee_id);
    }

    sql += ' ORDER BY a.date DESC, a.check_in_at DESC LIMIT 100';
    const records = (await db.query<any>(sql, params));
    return res.status(200).json({ data: records });
  });

  // GET /attendance/summary
  router.get('/attendance/summary', async (req: AuthenticatedRequest, res: Response) => {
    const isEmployee = req.user!.role === 'EMPLOYEE';
    const settings = (await db.queryOne<any>('SELECT * FROM settings WHERE id = ?', ['settings-1']));
    const holidays = (await db.query<any>('SELECT * FROM holidays'));
    const weekendDays = JSON.parse(settings?.weekend_days || '["Sat","Sun"]');

    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const monthStart = `${y}-${m}-01`;
    const lastDay = new Date(Date.UTC(y, now.getMonth() + 1, 0)).getUTCDate();
    const monthEnd = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;

    if (isEmployee) {
      const records = (await db.query<any>(
        'SELECT * FROM attendance WHERE employee_id = ? AND date >= ? AND date <= ?',
        [req.user!.employee_id, monthStart, monthEnd]
      ));
      const expectedDays = countWorkingDays(monthStart, monthEnd, holidays, weekendDays);
      const presentCount = records.filter((r) => r.status === 'present' || r.status === 'late').length;
      const rate = expectedDays > 0 ? Math.round((presentCount / expectedDays) * 100) : 100;

      return res.status(200).json({
        data: {
          scope: 'own',
          period: `${y}-${m}`,
          expected_working_days: expectedDays,
          attendance_days: records.length,
          present_days: records.filter((r) => r.status === 'present').length,
          late_days: records.filter((r) => r.status === 'late').length,
          half_days: records.filter((r) => r.status === 'half_day').length,
          attendance_rate: rate,
        },
      });
    }

    // Company wide
    const records = (await db.query<any>(
      'SELECT * FROM attendance WHERE date >= ? AND date <= ?',
      [monthStart, monthEnd]
    ));
    const activeEmps = (await db.query<any>("SELECT id FROM employees WHERE status != 'exited'"));
    const expectedDays = countWorkingDays(monthStart, monthEnd, holidays, weekendDays);
    const totalExpected = expectedDays * activeEmps.length;
    const presentCount = records.filter((r) => r.status === 'present' || r.status === 'late').length;
    const companyRate = totalExpected > 0 ? Math.round((presentCount / totalExpected) * 100) : 100;

    return res.status(200).json({
      data: {
        scope: 'company',
        period: `${y}-${m}`,
        total_active_employees: activeEmps.length,
        total_records: records.length,
        present_count: records.filter((r) => r.status === 'present').length,
        late_count: records.filter((r) => r.status === 'late').length,
        half_day_count: records.filter((r) => r.status === 'half_day').length,
        attendance_rate: companyRate,
      },
    });
  });

  // GET /attendance/corrections
  router.get('/attendance/corrections', async (req: AuthenticatedRequest, res: Response) => {
    const isHrOrAdmin = ['SUPERADMIN', 'ADMIN', 'HR'].includes(req.user!.role);
    let sql = `SELECT ac.*, e.code as employee_code, e.first_name, e.last_name
               FROM attendance_corrections ac
               JOIN employees e ON e.id = ac.employee_id`;
    const params: any[] = [];
    if (!isHrOrAdmin) {
      sql += ' WHERE ac.employee_id = ?';
      params.push(req.user!.employee_id);
    }
    sql += ' ORDER BY ac.created_at DESC';
    const list = (await db.query<any>(sql, params));
    return res.status(200).json({ data: list });
  });

  // POST /attendance/corrections
  router.post('/attendance/corrections', async (req: AuthenticatedRequest, res: Response) => {
    const empId = req.user!.employee_id;
    if (!empId) {
      return res.status(400).json({ error: { code: 'NO_EMPLOYEE_PROFILE', message: 'No employee profile.' } });
    }
    const { date, requested_check_in, requested_check_out, reason } = req.body || {};
    if (!validIsoDate(date) || !safeText(reason, 1000) ||
        !requested_check_in || !requested_check_out ||
        Number.isNaN(Date.parse(requested_check_in)) || Number.isNaN(Date.parse(requested_check_out)) ||
        Date.parse(requested_check_out) <= Date.parse(requested_check_in)) {
      return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Provide a valid date, check-in/out times and reason.'}});
    }
    const id = `ac-${crypto.randomBytes(6).toString('hex')}`;
    const nowIso = new Date().toISOString();
    (await db.run(
      `INSERT INTO attendance_corrections (id, employee_id, date, requested_check_in, requested_check_out, reason, status, decided_by, decision_comment, decided_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, ?)`,
      [id, empId, date, requested_check_in, requested_check_out, (reason || '').trim(), nowIso]
    ));
    return res.status(201).json({ data: { id, status: 'pending' } });
  });

  // PUT /attendance/corrections/:id/decide
  router.put('/attendance/corrections/:id/decide', requireRole('SUPERADMIN', 'ADMIN', 'HR'), async (req: AuthenticatedRequest, res: Response) => {
    const { decision, comment } = req.body || {};
    if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Choose approved or rejected.'}});
    const cor = (await db.queryOne<any>('SELECT * FROM attendance_corrections WHERE id = ?', [req.params.id]));
    if (!cor) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Correction not found.' } });
    }
    if (cor.status !== 'pending') return res.status(409).json({error:{code:'CONFLICT',message:'This correction has already been reviewed.'}});
    const nowIso = new Date().toISOString();
    (await db.run(
      'UPDATE attendance_corrections SET status = ?, decided_by = ?, decision_comment = ?, decided_at = ? WHERE id = ?',
      [decision, req.user!.id, comment || null, nowIso, cor.id]
    ));
    return res.status(200).json({ data: { id: cor.id, status: decision } });
  });

  // =============================================================
  // LEAVE
  // =============================================================

  // POST /leave/apply
  router.post('/leave/apply', async (req: AuthenticatedRequest, res: Response) => {
    const empId = req.user!.employee_id;
    if (!empId) {
      return res.status(400).json({
        error: { code: 'NO_EMPLOYEE_PROFILE', message: 'Current user has no associated employee profile.' },
      });
    }

    const { leave_type_id, start_date, end_date, reason } = req.body || {};
    if (!leave_type_id || !start_date || !end_date) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Leave type, start date, and end date are required.' },
      });
    }

    if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(start_date) ||
        !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(end_date)) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Dates must be in YYYY-MM-DD format.' },
      });
    }

    if (!validIsoDate(start_date) || !validIsoDate(end_date)) {
      return res.status(422).json({error:{code:'VALIDATION_ERROR',message:'Leave dates must be real YYYY-MM-DD dates.'}});
    }
    if (start_date > end_date) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Start date cannot be after end date.' },
      });
    }

    if (!safeText(reason, 1000)) return res.status(422).json({error:{code:'VALIDATION_ERROR',message:'Leave reason is required and must not contain HTML.'}});
    const leaveType = (await db.queryOne<any>('SELECT * FROM leave_types WHERE id = ?', [leave_type_id]));
    if (!leaveType) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Leave type not found.' } });
    }

    const settings = (await db.queryOne<any>('SELECT * FROM settings WHERE id = ?', ['settings-1']));
    const holidays = (await db.query<any>('SELECT * FROM holidays'));
    const weekendDays = JSON.parse(settings?.weekend_days || '["Sat","Sun"]');

    // Count working days in requested span
    const workingDays = countWorkingDays(start_date, end_date, holidays, weekendDays);
    if (workingDays === 0) {
      return res.status(400).json({
        error: { code: 'ZERO_WORKING_DAYS', message: 'The selected date range contains no working days.' },
      });
    }

    // Check for overlapping pending or approved leave
    const overlap = (await db.queryOne<any>(
      `SELECT id FROM leave_requests
       WHERE employee_id = ? AND status IN ('pending', 'approved')
       AND NOT (end_date < ? OR start_date > ?)`,
      [empId, start_date, end_date]
    ));
    if (overlap) {
      return res.status(409).json({
        error: { code: 'OVERLAPPING_LEAVE', message: 'You already have an active or pending leave during this period.' },
      });
    }

    // Quota validation across calendar years
    if (leaveType.yearly_quota !== null) {
      const daysByYear = countWorkingDaysByYear(start_date, end_date, holidays, weekendDays);

      for (const [yearStr, requestedDays] of Object.entries(daysByYear)) {
        const year = parseInt(yearStr, 10);
        const yStart = `${year}-01-01`;
        const yEnd = `${year}-12-31`;

        // Count pending + approved leaves for this employee in that calendar year
        const leavesInYear = (await db.query<any>(
          `SELECT start_date, end_date, working_days FROM leave_requests
           WHERE employee_id = ? AND leave_type_id = ? AND status IN ('pending', 'approved')
           AND NOT (end_date < ? OR start_date > ?)`,
          [empId, leave_type_id, yStart, yEnd]
        ));

        let consumedInYear = 0;
        for (const l of leavesInYear) {
          const split = countWorkingDaysByYear(l.start_date, l.end_date, holidays, weekendDays);
          consumedInYear += split[year] || 0;
        }

        if (consumedInYear + requestedDays > leaveType.yearly_quota) {
          return res.status(400).json({
            error: {
              code: 'QUOTA_EXCEEDED',
              message: `Requested ${requestedDays} day(s) exceeds remaining ${leaveType.name} quota for ${year}. Available: ${Math.max(0, leaveType.yearly_quota - consumedInYear)} day(s).`,
            },
          });
        }
      }
    }

    const id = `lv-${crypto.randomBytes(6).toString('hex')}`;
    const nowIso = new Date().toISOString();

    (await db.run(
      `INSERT INTO leave_requests (id, employee_id, leave_type_id, start_date, end_date, working_days, reason, status, decided_by, decision_comment, decided_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, ?)`,
      [id, empId, leave_type_id, start_date, end_date, workingDays, (reason || '').trim(), nowIso]
    ));

    return res.status(201).json({
      data: {
        id,
        leave_type_id,
        start_date,
        end_date,
        working_days: workingDays,
        reason: (reason || '').trim(),
        status: 'pending',
      },
    });
  });

  // GET /leave/my-balance
  router.get('/leave/my-balance', async (req: AuthenticatedRequest, res: Response) => {
    const empId = req.user!.employee_id;
    if (!empId) {
      return res.status(400).json({
        error: { code: 'NO_EMPLOYEE_PROFILE', message: 'Current user has no associated employee profile.' },
      });
    }

    const leaveTypes = (await db.query<any>('SELECT * FROM leave_types ORDER BY name ASC'));
    const activeLeaves = (await db.query<any>(
      `SELECT leave_type_id, working_days FROM leave_requests
       WHERE employee_id = ? AND status IN ('pending', 'approved')`,
      [empId]
    ));

    const balances = leaveTypes.map((lt) => {
      const used = activeLeaves
        .filter((l) => l.leave_type_id === lt.id)
        .reduce((sum, l) => sum + l.working_days, 0);

      return {
        id: lt.id,
        name: lt.name,
        yearly_quota: lt.yearly_quota,
        used_days: used,
        remaining_days: lt.yearly_quota === null ? null : Math.max(0, lt.yearly_quota - used),
        is_paid: Boolean(lt.is_paid),
      };
    });

    return res.status(200).json({ data: balances });
  });

  // GET /leave/requests
  router.get('/leave/requests', async (req: AuthenticatedRequest, res: Response) => {
    const isHrOrAdmin = ['SUPERADMIN', 'ADMIN', 'HR'].includes(req.user!.role);
    let sql = `SELECT lr.*, lt.name as leave_type_name, e.code as employee_code, e.first_name, e.last_name, d.name as department_name
               FROM leave_requests lr
               JOIN leave_types lt ON lt.id = lr.leave_type_id
               JOIN employees e ON e.id = lr.employee_id
               LEFT JOIN departments d ON d.id = e.department_id`;
    const params: any[] = [];

    if (!isHrOrAdmin) {
      sql += ' WHERE lr.employee_id = ?';
      params.push(req.user!.employee_id);
    }

    sql += ' ORDER BY lr.created_at DESC';
    const list = (await db.query<any>(sql, params));
    return res.status(200).json({ data: list });
  });

  // PUT /leave/requests/:id/decide
  router.put('/leave/requests/:id/decide', requireRole('SUPERADMIN', 'ADMIN', 'HR'), async (req: AuthenticatedRequest, res: Response) => {
    const { decision, comment } = req.body || {};
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: "Decision must be 'approved' or 'rejected'." },
      });
    }

    const leave = (await db.queryOne<any>('SELECT * FROM leave_requests WHERE id = ?', [req.params.id]));
    if (!leave) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Leave request not found.' } });
    }

    // decideLeave only works on status = 'pending' per audit requirements!
    if (leave.status !== 'pending') {
      return res.status(400).json({
        error: {
          code: 'INVALID_STATUS',
          message: `Leave request has already been ${leave.status}. Only pending requests can be decided.`,
        },
      });
    }

    // Re-check quota if approving
    if (decision === 'approved') {
      const leaveType = (await db.queryOne<any>('SELECT * FROM leave_types WHERE id = ?', [leave.leave_type_id]));
      if (leaveType && leaveType.yearly_quota !== null) {
        const settings = (await db.queryOne<any>('SELECT * FROM settings WHERE id = ?', ['settings-1']));
        const holidays = (await db.query<any>('SELECT * FROM holidays'));
        const weekendDays = JSON.parse(settings?.weekend_days || '["Sat","Sun"]');
        const daysByYear = countWorkingDaysByYear(leave.start_date, leave.end_date, holidays, weekendDays);

        for (const [yearStr, requestedDays] of Object.entries(daysByYear)) {
          const year = parseInt(yearStr, 10);
          const yStart = `${year}-01-01`;
          const yEnd = `${year}-12-31`;

          const alreadyApproved = (await db.query<any>(
            `SELECT start_date, end_date FROM leave_requests
             WHERE employee_id = ? AND leave_type_id = ? AND status = 'approved' AND id != ?
             AND NOT (end_date < ? OR start_date > ?)`,
            [leave.employee_id, leave.leave_type_id, leave.id, yStart, yEnd]
          ));

          let approvedCount = 0;
          for (const l of alreadyApproved) {
            const split = countWorkingDaysByYear(l.start_date, l.end_date, holidays, weekendDays);
            approvedCount += split[year] || 0;
          }

          if (approvedCount + requestedDays > leaveType.yearly_quota) {
            return res.status(400).json({
              error: {
                code: 'QUOTA_EXCEEDED',
                message: `Cannot approve leave: employee quota for ${year} would be exceeded.`,
              },
            });
          }
        }
      }
    }

    const nowIso = new Date().toISOString();
    (await db.run(
      'UPDATE leave_requests SET status = ?, decided_by = ?, decision_comment = ?, decided_at = ? WHERE id = ?',
      [decision, req.user!.id, comment ? comment.trim() : null, nowIso, leave.id]
    ));

    // Audit log
    (await db.run(
      `INSERT INTO audit_logs (id, actor_id, actor_role, action, entity, entity_id, before_json, after_json, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `aud-lvd-${Date.now()}`,
        req.user!.id,
        req.user!.role,
        decision === 'approved' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
        'leave_request',
        leave.id,
        JSON.stringify({ status: leave.status }),
        JSON.stringify({ status: decision, comment }),
        req.ip || '127.0.0.1',
        nowIso,
      ]
    ));

    return res.status(200).json({ data: { id: leave.id, status: decision } });
  });

  // PUT /leave/requests/:id/cancel
  router.put('/leave/requests/:id/cancel', async (req: AuthenticatedRequest, res: Response) => {
    const leave = (await db.queryOne<any>('SELECT * FROM leave_requests WHERE id = ?', [req.params.id]));
    if (!leave) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Leave request not found.' } });
    }

    // Role scope
    const isHrOrAdmin = ['SUPERADMIN', 'ADMIN', 'HR'].includes(req.user!.role);
    if (!isHrOrAdmin && req.user!.employee_id !== leave.employee_id) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Cannot cancel another employee’s leave.' } });
    }

    // Cancel rule:
    // Only works on pending, OR on approved leave starting in the future
    const today = new Date().toISOString().split('T')[0];
    const canCancel =
      leave.status === 'pending' ||
      (leave.status === 'approved' && leave.start_date > today);

    if (!canCancel) {
      return res.status(400).json({
        error: {
          code: 'CANNOT_CANCEL',
          message: 'Can only cancel pending leave, or approved leave that begins in the future.',
        },
      });
    }

    const nowIso = new Date().toISOString();
    (await db.run("UPDATE leave_requests SET status = 'cancelled' WHERE id = ?", [leave.id]));

    return res.status(200).json({ data: { id: leave.id, status: 'cancelled' } });
  });

  // =============================================================
  // PAYROLL
  // =============================================================

  // GET /payroll/runs
  router.get('/payroll/runs', requireRole('SUPERADMIN', 'ADMIN', 'HR'), async (_req: AuthenticatedRequest, res: Response) => {
    const runs = (await db.query<any>('SELECT * FROM payroll_runs ORDER BY month DESC, created_at DESC'));
    return res.status(200).json({
      data: runs.map((r) => ({
        ...r,
        total_gross: r.total_gross_cents / 100,
        total_net: r.total_net_cents / 100,
      })),
    });
  });

  // POST /payroll/runs
  router.post('/payroll/runs', requireRole('SUPERADMIN', 'ADMIN', 'HR'), async (req: AuthenticatedRequest, res: Response) => {
    const { month, department_id } = req.body || {};

    // Validate month format YYYY-MM
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({
        error: { code: 'INVALID_MONTH', message: 'Month must be in valid YYYY-MM format.' },
      });
    }

    // One payroll run per month for the whole company:
    // If a run already exists for YYYY-MM, return 409!
    const existingRun = (await db.queryOne<any>('SELECT id FROM payroll_runs WHERE month = ?', [month]));
    if (existingRun) {
      return res.status(409).json({
        error: {
          code: 'PAYROLL_RUN_EXISTS',
          message: `A payroll run for month ${month} already exists. Only one run per month is permitted.`,
        },
      });
    }

    const settings = (await db.queryOne<any>('SELECT * FROM settings WHERE id = ?', ['settings-1']));
    const holidays = (await db.query<any>('SELECT * FROM holidays'));
    const weekendDays = JSON.parse(settings?.weekend_days || '["Sat","Sun"]');
    const latePenaltyEnabled = Boolean(settings?.late_penalty_enabled);

    const [yStr, mStr] = month.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-${String(daysInMonth).padStart(2, '0')}`;

    // Fetch eligible employees: active or exited mid-month!
    // Include employees whose join_date <= monthEnd AND (exit_date IS NULL OR exit_date >= monthStart)
    let empSql = `SELECT e.*, ss.basic_cents
                  FROM employees e
                  LEFT JOIN salary_structures ss ON ss.employee_id = e.id
                  WHERE e.join_date <= ? AND (e.exit_date IS NULL OR e.exit_date >= ?)`;
    const empParams: any[] = [monthEnd, monthStart];

    if (department_id) {
      empSql += ' AND e.department_id = ?';
      empParams.push(department_id);
    }

    const employees = (await db.query<any>(empSql, empParams));
    if (employees.length === 0) {
      return res.status(400).json({
        error: { code: 'NO_EMPLOYEES', message: `No active or mid-month exited employees found for month ${month}.` },
      });
    }

    // CHECK: If any employee has no salary structure configured, DO NOT default to 60000! Block run with 400!
    for (const emp of employees) {
      if (emp.basic_cents === null || emp.basic_cents === undefined) {
        return res.status(400).json({
          error: {
            code: 'MISSING_SALARY_STRUCTURE',
            message: `Employee ${emp.first_name} ${emp.last_name} (${emp.code}) does not have a salary structure configured. Please configure their basic salary before running payroll.`,
          },
        });
      }
    }

    const runId = `pr-${month}-${crypto.randomBytes(4).toString('hex')}`;
    const nowIso = new Date().toISOString();

    let totalGrossCents = 0;
    let totalNetCents = 0;
    const payslipsToInsert: any[] = [];

    for (const emp of employees) {
      // Fetch attendance in month
      const attendanceRecords = (await db.query<any>(
        'SELECT status FROM attendance WHERE employee_id = ? AND date >= ? AND date <= ?',
        [emp.id, monthStart, monthEnd]
      ));
      const attendanceDays = attendanceRecords.filter((r) => r.status === 'present' || r.status === 'late').length;
      const halfDays = attendanceRecords.filter((r) => r.status === 'half_day').length;
      const lateCount = attendanceRecords.filter((r) => r.status === 'late').length;

      // Fetch approved leave in month
      const leaves = (await db.query<any>(
        `SELECT lr.working_days, lt.is_paid
         FROM leave_requests lr
         JOIN leave_types lt ON lt.id = lr.leave_type_id
         WHERE lr.employee_id = ? AND lr.status = 'approved'
         AND NOT (lr.end_date < ? OR lr.start_date > ?)`,
        [emp.id, monthStart, monthEnd]
      ));

      let approvedPaidLeaveDays = 0;
      let unpaidLeaveDays = 0;
      for (const l of leaves) {
        if (l.is_paid) {
          approvedPaidLeaveDays += l.working_days;
        } else {
          unpaidLeaveDays += l.working_days;
        }
      }

      const slip = computeEmployeePayroll({
        basicCents: emp.basic_cents,
        monthStr: month,
        joinDate: emp.join_date,
        exitDate: emp.exit_date,
        attendanceDays,
        halfDays,
        unpaidLeaveDays,
        approvedPaidLeaveDays,
        lateCount,
        latePenaltyEnabled,
        holidays,
        weekendDays,
      });

      totalGrossCents += slip.grossCents;
      totalNetCents += slip.netCents;

      payslipsToInsert.push({
        id: `ps-${runId}-${emp.id}`,
        run_id: runId,
        employee_id: emp.id,
        working_days: slip.monthWorkingDays,
        absent_days: slip.absentDays,
        unpaid_days: slip.unpaidLeaveDays,
        half_days: slip.halfDays,
        late_penalty_days: slip.latePenaltyDays,
        gross_cents: slip.grossCents,
        deductions_cents: slip.deductionsCents,
        tax_cents: slip.taxCents,
        net_cents: slip.netCents,
        breakdown_json: JSON.stringify(slip.breakdown),
      });
    }

    const created = await db.transaction(async () => {
    // Create payroll run record
    (await db.run(
      `INSERT INTO payroll_runs (id, month, department_id, status, total_gross_cents, total_net_cents, created_by, finalized_by, finalized_at, created_at)
       VALUES (?, ?, ?, 'draft', ?, ?, ?, NULL, NULL, ?)`,
      [runId, month, department_id || null, totalGrossCents, totalNetCents, req.user!.id, nowIso]
    ));

    // Insert payslips
    for (const p of payslipsToInsert) {
      (await db.run(
        `INSERT INTO payslips (id, run_id, employee_id, working_days, absent_days, unpaid_days, half_days, late_penalty_days, gross_cents, deductions_cents, tax_cents, net_cents, breakdown_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          p.id,
          p.run_id,
          p.employee_id,
          p.working_days,
          p.absent_days,
          p.unpaid_days,
          p.half_days,
          p.late_penalty_days,
          p.gross_cents,
          p.deductions_cents,
          p.tax_cents,
          p.net_cents,
          p.breakdown_json,
        ]
      ));
    }

    return ({
      data: {
        id: runId,
        month,
        status: 'draft',
        total_gross: totalGrossCents / 100,
        total_net: totalNetCents / 100,
        employee_count: payslipsToInsert.length,
      },
    });
    });
    return res.status(201).json(created);
  });

  // POST /payroll/runs/:id/finalize
  router.post('/payroll/runs/:id/finalize', requireRole('SUPERADMIN', 'ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
    const run = (await db.queryOne<any>('SELECT * FROM payroll_runs WHERE id = ?', [req.params.id]));
    if (!run) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Payroll run not found.' } });
    }

    if (run.status === 'finalized') {
      return res.status(409).json({
        error: { code: 'ALREADY_FINALIZED', message: 'Payroll run is already finalized.' },
      });
    }

    const created = await db.transaction(async () => {
    const nowIso = new Date().toISOString();
    (await db.run(
      "UPDATE payroll_runs SET status = 'finalized', finalized_by = ?, finalized_at = ? WHERE id = ?",
      [req.user!.id, nowIso, run.id]
    ));

    // Audit log
    (await db.run(
      `INSERT INTO audit_logs (id, actor_id, actor_role, action, entity, entity_id, before_json, after_json, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `aud-prfin-${Date.now()}`,
        req.user!.id,
        req.user!.role,
        'PAYROLL_RUN_FINALIZED',
        'payroll_run',
        run.id,
        JSON.stringify({ status: 'draft' }),
        JSON.stringify({ status: 'finalized', finalized_at: nowIso }),
        req.ip || '127.0.0.1',
        nowIso,
      ]
    ));

    return ({ data: { id: run.id, status: 'finalized', finalized_at: nowIso } });
    });
    return res.status(200).json(created);
  });

  // GET /payroll/runs/:id/payslips
  router.get('/payroll/runs/:id/payslips', async (req: AuthenticatedRequest, res: Response) => {
    const isHrOrAdmin = ['SUPERADMIN', 'ADMIN', 'HR'].includes(req.user!.role);
    let sql = `SELECT ps.*, e.code as employee_code, e.first_name, e.last_name, d.name as department_name, des.title as designation_title
               FROM payslips ps
               JOIN employees e ON e.id = ps.employee_id
               LEFT JOIN departments d ON d.id = e.department_id
               LEFT JOIN designations des ON des.id = e.designation_id
               WHERE ps.run_id = ?`;
    const params: any[] = [req.params.id];

    if (!isHrOrAdmin) {
      sql += ' AND ps.employee_id = ?';
      params.push(req.user!.employee_id);
    }

    const slips = (await db.query<any>(sql, params));
    return res.status(200).json({
      data: slips.map((s) => ({
        ...s,
        gross: s.gross_cents / 100,
        deductions: s.deductions_cents / 100,
        tax: s.tax_cents / 100,
        net: s.net_cents / 100,
        breakdown: JSON.parse(s.breakdown_json),
      })),
    });
  });

  // GET /payroll/my-payslips
  router.get('/payroll/my-payslips', async (req: AuthenticatedRequest, res: Response) => {
    const empId = req.user!.employee_id;
    if (!empId) {
      return res.status(200).json({ data: [] });
    }
    const slips = (await db.query<any>(
      `SELECT ps.*, pr.month as run_month, pr.status as run_status
       FROM payslips ps
       JOIN payroll_runs pr ON pr.id = ps.run_id
       WHERE ps.employee_id = ?
       ORDER BY pr.month DESC`,
      [empId]
    ));
    return res.status(200).json({
      data: slips.map((s) => ({
        ...s,
        gross: s.gross_cents / 100,
        deductions: s.deductions_cents / 100,
        tax: s.tax_cents / 100,
        net: s.net_cents / 100,
        breakdown: JSON.parse(s.breakdown_json),
      })),
    });
  });

  // GET /payslips/:id
  router.get('/payslips/:id', async (req: AuthenticatedRequest, res: Response) => {
    const slip = (await db.queryOne<any>(
      `SELECT ps.*, e.code as employee_code, e.first_name, e.last_name, e.email as employee_email,
              d.name as department_name, des.title as designation_title, pr.month as run_month
       FROM payslips ps
       JOIN employees e ON e.id = ps.employee_id
       JOIN payroll_runs pr ON pr.id = ps.run_id
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN designations des ON des.id = e.designation_id
       WHERE ps.id = ?`,
      [req.params.id]
    ));

    if (!slip) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Payslip not found.' } });
    }

    // Employee Data Shielding: an employee can ONLY see their own payslip!
    const isHrOrAdmin = ['SUPERADMIN', 'ADMIN', 'HR'].includes(req.user!.role);
    if (!isHrOrAdmin && req.user!.employee_id !== slip.employee_id) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not have permission to view other employees’ payslips.' },
      });
    }

    return res.status(200).json({
      data: {
        ...slip,
        gross: slip.gross_cents / 100,
        deductions: slip.deductions_cents / 100,
        tax: slip.tax_cents / 100,
        net: slip.net_cents / 100,
        breakdown: JSON.parse(slip.breakdown_json),
      },
    });
  });

  // =============================================================
  // AI ASSISTANT
  // =============================================================

  // POST /ai/chat
  router.post('/ai/chat', async (req: AuthenticatedRequest, res: Response) => {
    const { message } = req.body || {};
    if (!message || !message.trim()) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Message cannot be empty.' } });
    }

    const result = await ServerAiService.chat(
      message,
      { id: req.user!.id, role: req.user!.role, employee_id: req.user!.employee_id },
      db
    );

    return res.status(200).json({ data: result });
  });

  // POST /ai/smart-leave
  router.post('/ai/smart-leave', async (req: AuthenticatedRequest, res: Response) => {
    const { text } = req.body || {};
    if (!text || !text.trim()) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Text input is required.' } });
    }

    const result = await ServerAiService.parseSmartLeave(
      text,
      { id: req.user!.id, role: req.user!.role, employee_id: req.user!.employee_id },
      db
    );

    if (!result.success) {
      return res.status(400).json({ error: { code: 'AI_PARSE_FAILED', message: result.error } });
    }

    return res.status(200).json({ data: result.data });
  });

  // GET /ai/logs
  router.get('/ai/logs', requireRole('SUPERADMIN', 'ADMIN'), async (_req: AuthenticatedRequest, res: Response) => {
    const logs = (await db.query<any>('SELECT * FROM ai_logs ORDER BY created_at DESC LIMIT 50'));
    return res.status(200).json({ data: logs });
  });

  // =============================================================
  // AUDIT LOGS
  // =============================================================
  router.get('/audit-logs', requireRole('SUPERADMIN', 'ADMIN'), async (_req: AuthenticatedRequest, res: Response) => {
    const logs = (await db.query<any>('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100'));
    return res.status(200).json({
      data: logs.map((l) => ({
        ...l,
        before: l.before_json ? JSON.parse(l.before_json) : null,
        after: l.after_json ? JSON.parse(l.after_json) : null,
      })),
    });
  });

  // =============================================================
  // ANNOUNCEMENTS
  // =============================================================
  router.get('/announcements', async (_req: AuthenticatedRequest, res: Response) => {
    const list = (await db.query<any>('SELECT * FROM announcements ORDER BY created_at DESC'));
    return res.status(200).json({ data: list });
  });

  router.post('/announcements', requireRole('SUPERADMIN', 'ADMIN', 'HR'), async (req: AuthenticatedRequest, res: Response) => {
    const { title, body } = req.body || {};
    if (!title || !title.trim() || !body || !body.trim()) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Title and body are required.' } });
    }
    const id = `ann-${crypto.randomBytes(4).toString('hex')}`;
    const nowIso = new Date().toISOString();
    (await db.run(
      'INSERT INTO announcements (id, title, body, posted_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, NULL)',
      [id, title.trim(), body.trim(), req.user!.username, nowIso]
    ));
    return res.status(201).json({ data: { id, title: title.trim(), body: body.trim(), posted_by: req.user!.username } });
  });

  // =============================================================
  // NOTIFICATIONS
  // =============================================================
  router.get('/notifications', async (req: AuthenticatedRequest, res: Response) => {
    const list = (await db.query<any>(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
      [req.user!.id]
    ));
    return res.status(200).json({ data: list });
  });

  // =============================================================
  // AUTOMATED TEST SUITE RUNNER ENDPOINT
  // =============================================================
  if (process.env.NODE_ENV !== 'production') router.post('/system/run-tests', requireRole('SUPERADMIN'), async (_req: AuthenticatedRequest, res: Response) => {
    try {
      // Lazy load to prevent cycle
      const { runTestSuite } = await import('./testRunner.js');
      const results = await runTestSuite();
      return res.status(200).json({ data: results });
    } catch (err: any) {
      return res.status(500).json({ error: { code: 'TEST_RUN_ERROR', message: err?.message || 'Failed to run test suite.' } });
    }
  });

  return router;
}
