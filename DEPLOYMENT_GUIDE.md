# HCM Lite — Full Windows, API, PostgreSQL, GitHub and Vercel Setup

**Based on:** the provided HCM Lite ZIP and Saylani Hackathon HCM Lite challenge brief (9 modules, 25 features, 3 roles).  
**Target stack:** React 19 + Vite frontend, Express REST API, PostgreSQL (Neon), Google Gemini, JWT authentication, Vercel hosting.

> **Verification status:** This is a source-code integration package, **not a certified production release**. Source files were syntax-checked, but `npm install`, TypeScript type-checking, a real PostgreSQL test, Gemini API calls and deployment could NOT be completed in the packaging environment because access to the npm registry and your accounts was unavailable. Run the checks below before a public submission. Do not put real employee/payroll data in an untested app.

## 1. Do I need to make separate Admin, HR or Employee APIs?

**No.** The backend REST API already exists in `src/server/routes.ts` and is mounted under `/api/v1`. The same API serves all three dashboards, with permissions checked server-side. `SUPERADMIN` is an additional internal bootstrap role. **You do not create routes in Google AI Studio, Neon, or the Vercel console.** Vercel runs your Express routes.

```
Browser (React + Vite)
          |
          | /api/v1/... + JWT
          v
Vercel Node.js Function (api/index.ts)
          |-- Auth / role / employee scope
          |-- Organization / employee / attendance / leave / payroll
          |-- Announcements / dashboards / audit
          |-- Gemini tool-calling from src/server/ai.ts
          v
Neon PostgreSQL (DATABASE_URL)
```

**Main routes**, with `/api/v1` prefix:

| Route | Purpose | Relevant role |
|---|---|---|
| `POST /auth/login` | Sign in | All |
| `POST /auth/refresh` | Refresh session | All |
| `POST /auth/change-password` | First login password change | All |
| `GET /auth/me` | Own session | All |
| `GET /users`, `POST /users` | Users and HR login accounts | Admin |
| `GET /settings`, `PUT /settings` | Organization settings | Admin edits |
| `GET /departments`, `POST /departments` | Departments | Admin edits |
| `GET /designations`, `POST /designations` | Designations | Admin edits |
| `GET /holidays`, `POST /holidays` | Public holidays | Admin edits |
| `GET /leave-types` | Leave quotas | All authenticated |
| `GET /employees`, `POST /employees` | Employee directory and registration | Admin/HR |
| `POST /employees/import-csv` | Validate and import rows | Admin/HR |
| `POST /attendance/check-in`, `/attendance/check-out` | Web time records | HR/Employee |
| `POST /leave/apply` | Apply for leave | HR/Employee |
| `PUT /leave/requests/:id/decide` | Approve or reject leave | HR |
| `POST /payroll/runs` | Calculate monthly payroll draft | HR |
| `POST /payroll/runs/:id/finalize` | Finalize and lock payroll | Admin |
| `GET /payroll/my-payslips` | Employee pay history | Own records |
| `POST /ai/chat` | Data-aware AI assistant | All, scoped by role |
| `POST /ai/smart-leave` | Natural-language leave form | Employees/HR |
| `GET /audit-logs` | Audit trail | Admin |
| `GET /announcements` | Company announcements | All |
| `GET /notifications` | Personal notifications | Own records |
| `GET /health` | Public JSON status | No login |

API keys: only **Gemini's** API key is obtained from an AI provider; `JWT_SECRET` is generated locally; `DATABASE_URL` comes from Neon. No third-party accounts are required for individual Admin/HR/Employee logins.

## 2. Install required software on Windows

1. Install **Node.js 22 LTS or compatible newer LTS**: https://nodejs.org/en/download
2. Install **Git for Windows**: https://git-scm.com/download/win
3. Install **VS Code**: https://code.visualstudio.com/
4. Open PowerShell and verify:

```powershell
node --version
npm --version
git --version
```

Extract the provided ZIP into `C:\Projects\hcm-lite` (the ZIP contains an `hcm-lite` folder). Open **that** folder in VS Code; the correct root is the folder containing `package.json`.

## 3. Create the PostgreSQL database on Neon

1. Open https://console.neon.tech and sign in.
2. Choose **New Project**, name `hcm-lite`, select a suitable region (Mumbai or Singapore if offered), and use the free plan if available for your usage.
3. Open **Connect** and select a **pooled** PostgreSQL connection string suitable for serverless workloads.
4. Copy the complete `postgresql://...` URL, including its `sslmode=require` parameters. This URL includes a database password. **Never share it, commit it, or put it into frontend code.**
5. You **do not need to manually import tables** for a fresh database. The application's backend creates the tables on the first request, using `src/server/db.ts`.
6. On the first initialization, the backend seeds one Superadmin, company settings, four leave types (Annual 14, Sick 8, Casual 10, Unpaid unlimited), and an installation audit row. It creates **no example employees or departments**.
7. Later, enable backups and review database access controls in Neon.

**Database location in the code:** `src/server/db.ts`. There is no MySQL `.sql` import or local SQLite file in this package.

## 4. Obtain your Gemini API key

1. Open https://aistudio.google.com/apikey and sign in.
2. Create or select a Google AI Studio project, then choose **Create API Key**.
3. Copy the API key into your private `.env` locally and **Settings → Environment Variables** on Vercel.
4. Use `GEMINI_MODEL=gemini-3.8-flash` only if the Models page shows this model for your account; otherwise choose an available model that supports function calling and update `GEMINI_MODEL` accordingly: https://ai.google.dev/gemini-api/docs/models
5. `GEMINI_API_KEY` must only be used by `src/server/ai.ts` on the backend. Never create `VITE_GEMINI_API_KEY`.

The app exposes the three required AI features through its own API: `/ai/chat`, `/ai/smart-leave`, and dashboard summarization. If the Gemini key is unavailable, chat returns a clearly marked **basic (not AI-generated)** response rather than pretending the fallback is Gemini output.

## 5. Generate your JWT secret

JWT is **not** an external provider API. In PowerShell:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Copy the output (96 hex characters) into `JWT_SECRET`. This signs login access tokens; changing it invalidates existing sessions. **Keep the secret private.**

## 6. Create your local `.env`

In the project root (alongside `package.json`), copy `.env.example` to `.env`:

```powershell
Copy-Item .env.example .env
```

Edit `.env` as follows (values shown here are placeholders):

```dotenv
DATABASE_URL="postgresql://USERNAME:PASSWORD@NEON_HOST/NEON_DB?sslmode=require"
JWT_SECRET="PASTE_YOUR_RANDOM_96_HEX_CHAR_STRING"
ADMIN_USERNAME=superadmin
ADMIN_EMAIL=your-private-email@example.com
ADMIN_PASSWORD="YOUR_LONG_UNIQUE_PRIVATE_ADMIN_PASSWORD"
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
GEMINI_MODEL=gemini-3.8-flash
APP_URL=http://localhost:3000
NODE_ENV=development
```

- `DATABASE_URL`: obtained from Neon.
- `JWT_SECRET`: generated using Node crypto (above).
- `ADMIN_USERNAME`: first Superadmin login, default is `superadmin`.
- `ADMIN_PASSWORD`: choose a **new, private password of at least 12 characters**. Used once to bootstrap an empty database. Must be changed at first login. It is **not** the old `superadmin@123` value.
- `ADMIN_EMAIL`: optional first-admin email.
- `GEMINI_API_KEY`: from AI Studio.
- `GEMINI_MODEL`: provider model ID.
- `APP_URL`: change to your Vercel production URL after deployment.

**Important:** `.env` is in `.gitignore`. Commit only `.env.example`; do not send credentials in chat or GitHub.

## 7. Install and run the app locally

Run in VS Code Terminal → PowerShell:

```powershell
node scripts/check-env.cjs
npm install
npm run lint
npm run build
npm run dev
```

Open **http://localhost:3000**. If `npm install` fails, verify your Node version and inspect the first dependency error. Fix errors before committing. A successfully opening page does **not** prove that the database or API is working.

Visit **http://localhost:3000/api/v1/health**. Expected:

```json
{"status":"ok","service":"hcm-lite"}
```

On a new database, login using `ADMIN_USERNAME` and `ADMIN_PASSWORD`; the system forces a password change. Configure your company in the wizard. After that, create departments and designations and add an HR user. HR then registers employees and hands out one-time employee credentials.

**If your DB has already been initialized:** Changing `ADMIN_PASSWORD` in `.env` does not reset the existing account. Sign in with the password saved to PostgreSQL. Reset via an authorized admin action or create a new fresh database for your demo.

## 8. Run the test suite (separate database only)

**Never** run tests against production. Create a fresh disposable Neon database or branch and copy its connection string to `TEST_DATABASE_URL` in your local `.env`:

```dotenv
TEST_DATABASE_URL="postgresql://TEST_USER:TEST_PASSWORD@TEST_HOST/TEST_DB?sslmode=require"
```

Then run:

```powershell
npm test
```

The included test suite checks empty first run, default leave types, Superadmin login, password gate, logout scope and token rejection. Use a **fresh test database** per run because the tests change the test administrator password. Run additional manual end-to-end tests below; the smoke suite does not cover all 25 checklist items.

## 9. Create the GitHub repository

Your account: https://github.com/linkwithabdullah

1. Open https://github.com/new and sign in to **linkwithabdullah**.
2. Repository name: `hcm-lite`.
3. Start **Private** while validating credentials and source code. For the hackathon, make it public only after checking there are no secrets, or share judge access privately.
4. Do **not** generate another README/.gitignore (both already exist in this source).
5. In PowerShell **inside the project folder**:

```powershell
git init
git add .
git status
# Check .env, data/, node_modules/, .vercel/ are NOT staged
git commit -m "HCM Lite Vercel PostgreSQL integration"
git branch -M main
git remote add origin https://github.com/linkwithabdullah/hcm-lite.git
git push -u origin main
```

If a GitHub login prompt appears, authenticate in the browser. GitHub account URL alone doesn't authorize uploads. The first `npm install` should generate `package-lock.json`; include it in the commit so Vercel gets reproducible dependency versions. For subsequent changes:

```powershell
git add .
git commit -m "Fix HCM Lite"
git push origin main
```

## 10. Create your Vercel project and deploy

Your workspace: https://vercel.com/abdulah-khans-projects

1. Sign in to the workspace and choose **Add New → Project**.
2. Connect your GitHub account when prompted and choose `linkwithabdullah/hcm-lite` → **Import**.
3. Select **Vite** as the framework preset. Set Root Directory to `./`, Install Command to `npm install` (or let Vercel detect it), Build Command to `npm run build`, Output Directory to `dist`.
4. Under **Environment Variables**, add each of the following with the real private values:

   | Variable | Value | Production? |
   |---|---|---|
   | `DATABASE_URL` | Neon pooled Postgres URL | Yes |
   | `JWT_SECRET` | Node crypto random output | Yes |
   | `ADMIN_USERNAME` | `superadmin` (or your chosen value) | Yes |
   | `ADMIN_EMAIL` | Your email | Optional |
   | `ADMIN_PASSWORD` | Strong bootstrap password | Yes on first install |
   | `GEMINI_API_KEY` | AI Studio key | For AI features |
   | `GEMINI_MODEL` | Supported Gemini model ID | Yes |
   | `APP_URL` | Vercel production URL once known | Set after first deployment |

   Do not manually add `NODE_ENV=development` in Vercel; Vercel's production runtime sets production mode.

5. Click **Deploy**. Review Build Logs and Function Logs. The `api/index.ts` file is your Node.js function entry; `vercel.json` routes `/api/v1/*` requests to it and other client-side routes to `index.html`.
6. Once Vercel provides `https://YOUR-PROJECT.vercel.app`, update `APP_URL` with the exact **https** URL, and **Redeploy** so the variable becomes active.
7. Open `https://YOUR-PROJECT.vercel.app/api/v1/health` (must return JSON, not HTML).
8. Open the homepage, sign in as Superadmin, change the initial password, complete the company setup, create HR, and test business flows.

**If you create Neon through Vercel Marketplace rather than Neon Console:** Ensure that your Vercel environment variable is named exactly `DATABASE_URL`. Integrations sometimes use another variable name; map it to `DATABASE_URL` without copying credentials into code.

## 11. Complete five-minute hackathon validation

On an **empty** test/demo production database:

1. Sign in as the initial Superadmin (forced password change).
2. Complete first-run company setup; set office start (09:00), grace (15 min), weekends and optional location.
3. Create a department and designation, confirm the four seeded leave types, create an HR login.
4. Sign in as HR; register 2–3 real test employees (temporary passwords shown once).
5. Sign in as an employee; change password; check in using web attendance.
6. Create leave with natural language, review the form, submit it; HR approves and leaves/attendance KPIs update.
7. Check the HR dashboard and ask AI about leave/attendance; confirm it matches stored records.
8. HR creates monthly payroll **draft**; verify HR **cannot** finalize it. Admin finalizes it.
9. Employee opens/downloads own payslip. Employee must be refused another employee's salary.
10. Admin reviews audit log and announcements.

The PDF requires three role-specific interfaces, nine modules, 25 functionalities, server-enforced role/data scope, a live link and a README judges can run within 10 minutes. Optional camera/GPS attendance is bonus-only and not required for base scoring.

## 12. Common troubleshooting

| Problem | Cause / next step |
|---|---|
| `npm install` dependency failure | Check Node LTS and npm error details; remove stale `node_modules`, rerun install |
| `DATABASE_URL is required` | Add secret to `.env` locally or Vercel Environment Variables |
| `ADMIN_PASSWORD ... required` | Fresh DB requires at least 12-character bootstrap password; set it only on server |
| `JWT_SECRET must be set` | Generate random JWT secret, set on server, restart/redeploy |
| `/api/v1/health` returns HTML | Incorrect function routing/rewrite. Check `vercel.json` and Vercel Build/Function logs |
| `/api/v1/health` returns HTTP 500 | DB unreachable, invalid Postgres credentials, missing backend env variable or failed schema init; inspect logs |
| `relation does not exist` | Schema initialization failed; inspect cold-start Function logs, verify the DB permissions |
| Cannot connect to Neon | Check full URL, SSL mode, pooled endpoint, network and region |
| Cannot log in after redeploy | Stored database password is authoritative. Updating `ADMIN_PASSWORD` alone does not reset existing users |
| Gemini fallback used | Check GEMINI_API_KEY, GEMINI_MODEL, quota and Vercel function logs |
| HR can finalize payroll | Do not submit; ensure current `src/server/routes.ts` was deployed (should be Admin-only) |
| `npm test` fails after previous run | The disposable test database is no longer fresh; recreate a fresh test branch |

## 13. Production checklist and limits

- [ ] `.env` and credentials excluded from Git history.
- [ ] `npm install`, `npm run lint`, `npm run build` pass **on your machine or CI**.
- [ ] `npm test` passes against a fresh `TEST_DATABASE_URL`.
- [ ] App loads through HTTPS on Vercel.
- [ ] `/api/v1/health` returns JSON.
- [ ] Admin/HR/Employee roles and server-side data scope validated.
- [ ] Date validation, payroll formula and monthly run locking manually checked.
- [ ] Gemini replies use allowed tools, never exposing payroll outside role scope.
- [ ] Neon backup/restore configured for any real use.
- [ ] README states honestly which of the hackathon's 25 items have and have not been verified.

**Important remaining limitations:** Not all 25 business/role workflows have automated regression coverage. No deployment to your GitHub or Vercel account was performed while creating this archive. Some legacy pages and advanced rules may still require fixes uncovered by real end-to-end tests. Treat the code as an integrated deployment candidate until all checklist items pass.

## Authoritative provider docs

- Vercel Vite: https://vercel.com/docs/frameworks/frontend/vite
- Vercel Express: https://vercel.com/docs/frameworks/backend/express
- Vercel environment variables: https://vercel.com/docs/environment-variables
- Neon: https://neon.tech/docs/introduction
- Gemini model IDs: https://ai.google.dev/gemini-api/docs/models
- Google AI Studio API keys: https://aistudio.google.com/apikey
