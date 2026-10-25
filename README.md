# HCM Lite — AI-Powered Human Capital Management

**Saylani Hackathon HCM Lite (React + Vite + Express + PostgreSQL + Gemini)**

This application contains the three role-specific UIs (Superadmin/Admin, HR, Employee), employee registration and one-time logins, organization settings, web attendance, leave requests and approvals, monthly payroll, payslips, dashboards, AI assistant, announcements, notifications and an audit log. It is a migration of the supplied existing project, **not a new replacement UI**.

## Run locally (quick start)

Requires **Node.js 22+** and a **Neon PostgreSQL database**.

```powershell
Copy-Item .env.example .env
# Enter your DATABASE_URL, JWT_SECRET, ADMIN_PASSWORD and optional Gemini key in .env
npm install
npm run lint
npm run build
npm run dev
```

Browse `http://localhost:3000` and check `http://localhost:3000/api/v1/health`. A fresh DB automatically creates its schema, initial settings, one first-login Superadmin and four leave types (14/8/10/unlimited). **No dummy staff are seeded.**

**Initial administrator:** the username/password set through `ADMIN_USERNAME` (default `superadmin`) and `ADMIN_PASSWORD` in your private environment. You must change the bootstrap password at first login. Never use a published default password.

## Deploy on GitHub + Vercel

See **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** for complete instructions, API paths, environment variables, Neon integration, GitHub commands, Vercel configuration, end-to-end judge demo and troubleshooting.

Suggested repo: `https://github.com/linkwithabdullah/hcm-lite` (create this yourself). Suggested Vercel workspace: `https://vercel.com/abdulah-khans-projects`.

## Important deployment status

This package was source-edited and syntax-checked. **No install/build/type-check with installed dependencies, live Postgres/Gemini test or Vercel deployment was possible in the packaging environment.** Run the verification and fix any remaining issues before presenting it as complete or storing real HR data. Do not commit `.env`, SQLite files, generated payroll records or credentials. Keep the hackathon submission repo public only after a secrets scan (or share it privately with judges).
