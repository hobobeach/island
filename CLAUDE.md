# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm install            # bundled .npmrc enables legacy-peer-deps (see "Install caveat" below)
npm run dev            # nodemon → ts-node src/server.ts; reloads on src/, views/, public/ changes
npm run build          # rimraf ./dist && tsc
npm start              # build + node dist/server.js
npx tsc --noEmit       # type-check without emitting (no lint or test scripts are configured)
```

There is no test framework, linter, or formatter wired up. Nodemon ignores `*.spec.ts` / `*.test.ts` proactively, but no harness will pick them up.

## Install caveat

`npm install` relies on `legacy-peer-deps=true` in `.npmrc` to resolve a peerOptional mismatch: `typeorm@0.3.x` declares `sqlite3@^5`, but this repo uses `sqlite3@^6`. Don't strip `.npmrc` or run `npm install --strict-peer-deps` — install will fail.

## Environment

`src/app.ts` loads `.env.${NODE_ENV}` (default `development`) via dotenv at startup. Required:

- `JWT_SECRET` — `src/shared/jwt.ts` throws at module load time if unset, so the server won't boot without it.

Optional:

- `PORT` (default 3000; server auto-falls back to `port+1` on `EADDRINUSE`, see `src/server.ts:14-23`)
- `DATABASE_NAME` (default `database.sqlite`, written to repo root)

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

Helmet's CSP is configured with `style-src 'self' 'unsafe-inline'` because the Handlebars views embed `<style>` blocks inline (`views/index.hbs`, `views/error-*.hbs`). If you ever extract styles into `/public`, tighten CSP back to `'self'`.

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

`POST /login` (`src/routes/login.ts`) verifies `username` + `password` against the `User` table with `bcrypt.compare` (running a dummy compare for unknown usernames to keep response timing constant), then issues an httpOnly JWT cookie and redirects admins to `/admin` and everyone else to `/`. "Remember me" controls token expiry (`30d` vs `1d`) and whether the cookie persists. `GET /logout` clears the cookie and redirects to `/login`. `GET /admin` is guarded by `requireAdmin` (`src/middlewares/auth.ts`): it authenticates the JWT via the `'jwt'` strategy and admits only `isAdmin` users — unauthenticated visitors are redirected to `/login`, authenticated non-admins to `/`. `passport.initialize()` is mounted in the `src/app.ts` middleware pipeline (after `cookie-parser`, so the cookie extractor works); any route using `passport.authenticate` depends on it.

### Persistence (`src/app-data-source.ts`)
TypeORM with `type: 'sqlite'`, `synchronize: true`, `logging: true`. The `entities` array is **empty** — when adding entities, register them here and rely on auto-sync for dev (synchronize is unsafe for production).

### Views (`views/`)
Handlebars via `express-handlebars`, layout `default.hbs` injects `{{{ body }}}` and `{{ title }}`. Templates are passed `...config` (from `src/shared/config.ts`) plus per-render data. `config` is currently safe to spread into render contexts (no secrets) — keep it that way; if secrets need to live somewhere, don't put them in `config`.

`admin.hbs` is the exception: it's a complete standalone HTML document (its own `<head>` and asset shell, adapted from `template/admin-dashboard/`), so its route renders it with `layout: false`. Its assets live under `public/admin-assets/` — namespaced separately from the main theme's `public/assets/` to avoid collisions. Inline scripts from the source template were extracted to `public/admin-assets/js/dashboard-init.js` so CSP `script-src` stays `'self'`.

### Logging (`src/shared/log.ts`)
Chalk-coloured console logger: `log`, `logWarning`, `logError(error, { method, url })`, `logSpacer`. `pino` is a dependency but unused — the project lists it as planned tooling, not active infrastructure.

## TypeScript

`strict: true` with one exception: `strictPropertyInitialization: false` (for TypeORM entity classes that initialize via decorators). Decorators are enabled (`experimentalDecorators` + `emitDecoratorMetadata`). `noUnusedLocals` / `noUnusedParameters` are **off**, so the build tolerates pre-existing unused imports — don't rely on the compiler to flag them.

Prefer `unknown` over `any` for new error-typed parameters; `src/middlewares/error.ts` is the reference pattern.
