# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Commands

```sh
npm install            # install dependencies (resolves cleanly — no .npmrc needed)
npm run dev            # nodemon → ts-node src/server.ts; reloads on src/, views/, public/ changes
npm run build          # rimraf ./dist && tsc
npm start              # build + node dist/server.js
npx tsc --noEmit       # type-check without emitting (no lint or test scripts are configured)
npm run backup         # snapshot the SQLite DB and upload it to S3 (see scripts/backup-db.ts)
```

There is no test framework, linter, or formatter wired up. Nodemon ignores `*.spec.ts` / `*.test.ts` proactively, but no harness will pick them up.

## Environment

`src/app.ts` loads `.env.${NODE_ENV}` (default `development`) via dotenv at startup. Required:

- `JWT_SECRET` — `src/shared/jwt.ts` throws at module load time if unset, so the server won't boot without it.

Optional:

- `PORT` (default 3000; server auto-falls back to `port+1` on `EADDRINUSE`, see `src/server.ts:14-23`)
- `DATABASE_PATH` / `DATABASE_NAME` — SQLite file location (`src/app-data-source.ts`). `DATABASE_PATH` (a full path) takes precedence; otherwise `DATABASE_NAME` (a bare filename, default `database.sqlite`). Relative values resolve against the repo root, so the location doesn't depend on the process's working directory.
- `SES_FROM_ADDRESS` + `AWS_REGION` — sender identity and region for invite emails via AWS SES (`src/shared/mailer.ts`). When **either is blank the email is logged to the console instead of sent** — the default in development. AWS credentials come from the standard provider chain (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` env vars or an IAM role).
- `APP_URL` — base URL used to build the emailed signup link **and** Stripe Checkout success/cancel URLs (default: `config.url`)
- `STRIPE_SECRET_KEY` — required to create PaymentIntents for the membership fee (`src/shared/stripe.ts`); `getStripe()` throws without it. `STRIPE_PUBLISHABLE_KEY` — required by the browser card form on `/pay`; `GET /pay` throws without it.
- `S3_BUCKET_BACKUPS` — destination bucket for SQLite backups (uploaded as timestamped snapshots). Used both by `npm run backup` (`scripts/backup-db.ts`, a thin CLI wrapper) and by the automatic scheduler. `S3_REGION_BACKUPS` — bucket region (falls back to `AWS_REGION`); credentials come from the standard AWS provider chain. The shared upload logic lives in `src/shared/backup.ts` (`backupDatabaseToS3()`).
- `BACKUP_CRON_SCHEDULE` — cron expression for **automatic** backups, which run **only in production**: `src/server.ts` calls `startBackupSchedule()` (`src/shared/backup-schedule.ts`), which schedules `backupDatabaseToS3()` via `node-cron` (UTC). Default when blank: every 6 hours (`0 */6 * * *`). The scheduler no-ops outside production, and logs a warning + schedules nothing if `S3_BUCKET_BACKUPS` is unset or the expression is invalid.

## Plugins

This project was scaffolded from `@hobobeach/express-base`. Installed plugins are tracked in `package.json#hobobeachExpressBase.plugins`. Their inserted code is wrapped in `// PLUGIN <name> BEGIN` / `END` markers (or `<!-- ... -->` in `.hbs`); editing inside the markers is fine, but leave the markers themselves so the CLI knows not to double-apply if you re-run it.

Add more plugins later with:

```sh
npx @hobobeach/express-base add <plugin>
```

## Architecture

### Boot order
`src/server.ts` → `AppDataSource.initialize()` (TypeORM) → `app.listen()`. The DB connection is awaited before the HTTP server starts; failures here block boot.

### Middleware pipeline (`src/app.ts`)
Order matters: Helmet → CORS → body parsers → cookie-parser → static (`/public`) → routes (`/`) → 404 catch-all (`createError(404)`) → `errorHandler`. The 404 catch-all and `errorHandler` must remain last, in that order.

Helmet's CSP is configured with `style-src 'self' 'unsafe-inline'` because the Handlebars views embed `<style>` blocks inline (`views/index.hbs`, `views/error-*.hbs`). If you ever extract styles into `/public`, tighten CSP back to `'self'`. `script-src`, `frame-src`, and `connect-src` are extended to allow Stripe.js and Elements (`js.stripe.com`, `hooks.stripe.com` for 3-D Secure, `api.stripe.com`) for the custom card form on `/pay`.

### Error model (`src/middlewares/error.ts`)
Errors propagate via `next(createError(status, message))` from `http-errors`. The handler:

1. Delegates to Express's default handler if `response.headersSent` (mid-stream errors).
2. Logs: 404s via `logWarning`, everything else via `logError(error, { method, url })` which prints the stack trace.
3. Sanitizes any `status >= 500` to `"An unexpected error occurred."` before responding (both JSON and HTML branches — never leak raw 5xx messages).
4. Branches on URL prefix:
   - `/assets/*` → empty body (`response.end()`)
   - `/api/*` → JSON `{ status, message }`
   - everything else → renders `error-404.hbs` (404) or `error-other.hbs` (anything else) with `{ ...config, title, status, message }`

If you add a new content-type branch, preserve the `status >= 500` sanitization.

### Auth (`src/shared/jwt.ts`)
Passport JWT strategy registered as `'jwt'` in `src/app.ts`. Tokens are extracted from the `Authorization: Bearer <token>` header or, failing that, the `AUTH_COOKIE` (`'token'`) cookie set by `POST /login` — cookie extraction depends on `cookie-parser` running earlier in the pipeline. The strategy passes the JWT payload through as `req.user` without a DB lookup, so a token stays valid until expiry even if the `User` row changes. `generateToken(payload, expiresIn)` is the canonical sign helper.

`POST /login` (`src/routes/login.ts`) verifies `username` + `password` against the `User` table with `bcrypt.compare` (running a dummy compare for unknown usernames to keep response timing constant), then issues an httpOnly JWT cookie (via `issueSession`, `src/shared/session.ts`) and redirects admins to `/admin`, paid members to `/`, and members who haven't paid the fee to `/pay`. "Remember me" controls token expiry (`30d` vs `1d`) and whether the cookie persists. `GET /logout` clears the cookie and redirects to `/login`. Every `/admin/*` route is guarded by `requireAdmin` (`src/middlewares/auth.ts`), applied router-wide via `adminRouter.use(requireAdmin)`: it authenticates the JWT via the `'jwt'` strategy and admits only `isAdmin` users — unauthenticated visitors are redirected to `/login`, authenticated non-admins to `/`. The `/admin/invites` page lists invite requests and actions them in-browser: `POST /admin/invites/:id/approve` (creates a `User` — with optional admin rights — and marks the request approved) and `POST /admin/invites/:id/reject`, mirroring the `npm run invites` CLI. Both use Post/Redirect/Get with an `?ok=`/`?error=` flash message. A third option, `POST /admin/invites/:id/invite`, instead emails the applicant a signup link (SES, see Environment) and sets status `invited`, recording the admin's `grantAdmin` choice on the `InviteRequest`; `POST /admin/invites/:id/resend` re-emails the link for an `invited` request and resets its `invitedAt` (expiry). The link lands on `GET /signup/:token` (token = the request's `uuid`); `POST /signup/:token` lets the applicant set their own username/password, creates the `User` (with `isAdmin` from `grantAdmin`), and marks the request `approved`. Signup links expire 14 days after `invitedAt`. `passport.initialize()` is mounted in the `src/app.ts` middleware pipeline (after `cookie-parser`, so the cookie extractor works); any route using `passport.authenticate` depends on it.

### Membership payment (`src/routes/pay.ts`)
New non-admin accounts owe a one-time membership fee (`MEMBERSHIP_FEE_CENTS`, `src/shared/stripe.ts`). `POST /signup/:token` logs the new user in and sends them to `/pay`; `POST /login` also routes any unpaid non-admin there. The `/pay/*` routes are guarded by `requireAuth` (any logged-in user).

Payment uses a **custom card form on the site** (no hosted Checkout redirect): `GET /pay` creates a card-only **PaymentIntent** (`payment_method_types: ['card']`, `metadata.userId`) and renders `pay.hbs`, which embeds a **Stripe Card Element**. The browser-side `public/assets/js/pay.js` reads the publishable key and `client_secret` from `data-` attributes, mounts the element, and calls `stripe.confirmCardPayment(...)`; on success it navigates to `GET /pay/success?payment_intent=…`, which retrieves the PaymentIntent, verifies `status === 'succeeded'` and a matching `metadata.userId`, then sets `hasPaid` / `paidAt` / `stripePaymentIntentId` on the `User`. Admins and already-paid users are bounced off `/pay`. Confirmation relies on the user reaching `/pay/success` — a Stripe **webhook** (`payment_intent.succeeded`) is the recommended hardening. Both `STRIPE_SECRET_KEY` (server) and `STRIPE_PUBLISHABLE_KEY` (browser) are now used.

### Bootstrapping the first admin (`scripts/create-admin.ts`)
The app is invite-only and the in-app flows only create users by approving existing invite requests — so the first admin must be seeded out-of-band. `npm run create-admin` (a one-off, non-interactive `ts-node` script) reads `ADMIN_NAME` / `ADMIN_USERNAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` from the environment and inserts one `User` with `isAdmin: true` (and `hasPaid: true`). It's safe to re-run — it exits without changes if that email is already an admin, and refuses (without modifying anything) if the email/username collides with a different account. In production (Render), run it once via the Shell **after** the persistent disk + `DATABASE_PATH` are configured, or the seeded admin is wiped on the next deploy. There is no in-app change-password flow, so the bootstrap password is effectively permanent.

### Persistence (`src/app-data-source.ts`)
TypeORM with `type: 'better-sqlite3'`, `synchronize: true`, `logging: true`. The `better-sqlite3` driver ships prebuilt native binaries (no from-source compile), which keeps installs reliable in CI/production. Register new entities in the `entities` array and rely on auto-sync for dev (synchronize is unsafe for production).

### Views (`views/`)
Handlebars via `express-handlebars`, layout `default.hbs` injects `{{{ body }}}` and `{{ title }}`. Templates are passed `...config` (from `src/shared/config.ts`) plus per-render data. `config` is currently safe to spread into render contexts (no secrets) — keep it that way; if secrets need to live somewhere, don't put them in `config`.

Admin pages use a second layout, `layouts/admin.hbs` (the dashboard shell adapted from `template/admin-dashboard/` — its own `<head>`, sidebar, and page header). Admin routes render a body view (`admin.hbs` = dashboard, `admin-invites.hbs` = invite requests) with `layout: 'admin'`. Per-page `<script>`s are passed as a `pageScripts` string array, which the layout emits after the core theme bundle; the sidebar's active item is set via `navDashboard` / `navInvites` booleans. Admin assets live under `public/admin-assets/` — namespaced separately from the main theme's `public/assets/` to avoid collisions. Inline scripts from the source template were extracted to `public/admin-assets/js/dashboard-init.js` so CSP `script-src` stays `'self'`.

### Logging (`src/shared/log.ts`)
Chalk-coloured console logger: `log`, `logWarning`, `logError(error, { method, url })`, `logSpacer`. `pino` is a dependency but unused — the project lists it as planned tooling, not active infrastructure.

## TypeScript

`strict: true` with one exception: `strictPropertyInitialization: false` (for TypeORM entity classes that initialize via decorators). Decorators are enabled (`experimentalDecorators` + `emitDecoratorMetadata`). `noUnusedLocals` / `noUnusedParameters` are **off**, so the build tolerates pre-existing unused imports — don't rely on the compiler to flag them.

Prefer `unknown` over `any` for new error-typed parameters; `src/middlewares/error.ts` is the reference pattern.
