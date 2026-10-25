/* Minimal local environment preflight, no third-party packages and no secret output. */
/* Minimal local environment preflight, no third-party packages and no secret output. */
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(process.cwd(),'.env');
if (!fs.existsSync(file)) {
  console.error('Missing .env. Copy .env.example to .env and fill in your private values.');
  process.exit(1);
}
const raw = fs.readFileSync(file,'utf8');
const env = {};
for(const line of raw.split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z_][A-Z_0-9]*)\s*=\s*(.*)\s*$/);
  if (!match) continue;
  env[match[1]] = match[2].trim().replace(/^(["'])(.*)\1$/,'$2');
}
const errors = [];
if (!/^postgres(ql)?:\/\//.test(env.DATABASE_URL||'') || /USER:PASS|USER:PASSWORD|NEON_HOST/.test(env.DATABASE_URL||''))
  errors.push('DATABASE_URL: use the complete Neon pooled PostgreSQL connection URL');
if ((env.JWT_SECRET||'').length < 32 || /GENERATE_|YOUR_|PASTE_/.test(env.JWT_SECRET||''))
  errors.push('JWT_SECRET: generate at least 32 cryptographically random characters');
if ((env.ADMIN_PASSWORD||'').length < 12 || /CHOOSE_|YOUR_|PASSWORD_HERE/.test(env.ADMIN_PASSWORD||''))
  errors.push('ADMIN_PASSWORD: use a private password at least 12 characters long');
if (!(env.APP_URL||'').startsWith('http')) errors.push('APP_URL: use http://localhost:3000 or your production HTTPS URL');
if (!env.GEMINI_API_KEY) console.log('Optional: GEMINI_API_KEY not configured — AI will have limited fallback.');
if (errors.length) {
  console.error('Environment preflight FAILED:\n- '+errors.join('\n- '));
  process.exit(1);
}
console.log('Environment preflight passed (syntax/presence only). Secrets not printed.');
console.log('This does NOT test database connectivity or Gemini API access.');
