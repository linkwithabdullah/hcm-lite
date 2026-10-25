# HCM Lite — Source verification status

## Changes included

- Preserved the nine application modules and the existing Express `/api/v1` routes.
- Replaced the local SQLite persistence layer with `pg`-based PostgreSQL queries and fresh-install schema initialization, including an advisory-lock-protected bootstrap.
- Seeded only the initial privileged user (from server environment), default company settings, leave quotas and initial audit event. No dummy employees or departments.
- Added Vercel Express function `api/index.ts`, Vite SPA and API rewrites, and local Vite/Express entrypoint.
- Added the example environment, database schema reference, Windows-to-Vercel instructions and a non-disclosing environment preflight script.
- Updated password and account behavior, payroll finalization role guard, organization setup permissions, employee data scope, validation of new employee and attendance-correction input, and restored CSV import commit behavior.
- Updated Gemini env model configuration and policy formula, with clearer fallback messages.
- Fixed employee registration form to collect date of birth, gender and matching designation, and hydrate the company name/settings from the real API.

## Checks completed here

- Read and compared source with the provided Saylani HCM Lite brief.
- Statically parsed **35 TypeScript/TSX application files** with TypeScript 5.8.3; **zero parse diagnostics**.
- Verified the project includes API, database, settings template, README and deployment instructions.
- Verified private `.env`, `node_modules`, `dist`, database `data/` and `.vercel` are ignored/excluded from the distributable archive.

## NOT VERIFIED here — must run before use

- `npm install` or lockfile generation (registry unavailable to this packaging environment).
- `npm run lint`, `npm run build` and actual browser UI use with installed dependencies.
- SQL schema execution, migrations, application flow or transactional integrity against a live PostgreSQL server.
- Real Gemini API interaction and quota/model compatibility.
- Vercel function routing and production deployment.
- Comprehensive automated tests of all 25 acceptance items and external security review.

This is a **full revised source package and deployment candidate**, not a certified ready-to-use production release. Do not load confidential HR records or publicly submit until the checks in `DEPLOYMENT_GUIDE.md` pass. GitHub repository and Vercel project were not created for the user, because provided account URLs do not authorize account operations.
