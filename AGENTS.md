# Repository Guidelines

NestJS 11 + TypeScript API for AI-powered resume analysis, backed by MongoDB (Mongoose). Use **pnpm only**; npm and yarn are not allowed.

## Project Structure

- `src/` — application source. One folder per domain module (`user`, `auth`, `resume`, `resume-ai`, `ai`, `template`, `admin`, `interview`, plus OAuth providers `gitee-auth`, `github-auth`, `qq-auth`), each containing `*.module.ts`, `*.controller.ts`, `*.service.ts`, DTOs, and colocated `*.spec.ts` tests. Larger modules (e.g. `interview/`) use `dto/`, `schemas/`, `services/`, `prompt/`, `utils/` subfolders.
- `src/common/` — shared infrastructure: global exception filters, response/logging interceptors, upload utilities, Winston logger config, crypto utils, and `src/common/oauth/` base controller/service that all three OAuth provider modules extend.
- `test/` — end-to-end tests (`*.e2e-spec.ts`) and mocks.
- `scripts/` — seeders and one-off utilities (e.g. `scripts/seed-templates.ts`, compiled with `tsconfig.scripts.json`).
- `docs/api/` — API docs for complex areas (SSE resume generation, mock interview); `docs/plans/` — implementation plans. Read the matching doc before touching those areas.
- `uploads/` — runtime file storage (statically served at `/uploads/`); `dist/` — build output. Both are gitignored.

## Build, Test, and Development Commands

```bash
pnpm install          # install dependencies
pnpm start:dev        # run dev server with watch mode
pnpm build            # compile TypeScript to dist/
pnpm start:prod       # run compiled app (node dist/main)
pnpm lint             # ESLint + Prettier, auto-fix
pnpm format           # Prettier formatting
pnpm test             # unit tests (Jest)
pnpm test:e2e         # end-to-end tests
pnpm test:cov         # unit tests with coverage report
pnpm seed:templates   # seed resume templates
```

## App Wiring (registered once in `src/app.module.ts` / `src/main.ts` — don't re-implement)

- Global API prefix `/api/v1`; every route lives under it.
- Global `ValidationPipe({ whitelist: true, transform: true })` — DTOs must use `class-validator` decorators, otherwise unknown properties are silently stripped.
- `LoggingInterceptor` + `ResponseInterceptor` (`APP_INTERCEPTOR`) and `AllExceptionsFilter` (`APP_FILTER`) are global.
- Global rate limiting: 30 requests / 60 s per IP (`ThrottlerModule.forRoot`).
- `JwtModule` is global (secret from `JWT_SECRET`, 2-day expiry).
- NestJS `Logger` is bridged to Winston in `src/main.ts`: all `new Logger(...)` calls also write daily-rotated files under `logs/`. Use `new Logger()`; don't hand-roll logging.
- CORS origin whitelist comes from the `CORS_ORIGINS` env var (comma-separated).


## Coding Style & Naming Conventions

Prettier enforces 2-space indentation, single quotes, semicolons, and trailing commas. ESLint applies `typescript-eslint` recommended rules plus Prettier with `endOfLine: auto`. TypeScript uses `strictNullChecks`.

Use kebab-case file names (`resume-ai.service.ts`), PascalCase classes, and camelCase methods. Keep unit specs next to their source files.

Hard constraints:

- All external AI calls must go through `src/ai/` (DeepSeek + LangChain).
- Never bypass the global `ResponseInterceptor` / `AllExceptionsFilter`; controllers must not build response envelopes themselves.
- Read configuration through `ConfigService`; never use `process.env` directly.
- Copy `.env.example` to `.env` for local development; never commit `.env` or `uploads/`. Required keys: `MONGODB_URI`, `JWT_SECRET`, `DEEPSEEK_API_KEY`, `ENCRYPTION_KEY`, plus OAuth credentials only if touching that module.
- Puppeteer renders resumes to PDF (`src/resume/resume.service.ts` keeps an app-level singleton browser); never launch it inside unit tests.

## Testing Guidelines

Use Jest + ts-jest with `@nestjs/testing`; inject mocks via `useValue`. Unit tests (`*.spec.ts`) live beside their source files (Jest `rootDir` is `src/`); E2E tests (`*.e2e-spec.ts`) live in `test/`. The Jest `moduleNameMapper` maps `src/...` imports to the real files, so specs may import via `src/...`. Name tests by behavior, e.g. `should reject an invalid resume payload`. Run lint and tests before pushing; run `test:cov` for PRs touching core services.

Work test-first (TDD). Write the spec that expresses the expected behavior and watch it fail for the right reason before touching the implementation, then write the minimal code to pass, then refactor with the spec as the safety net.

- New behavior (feature, bug fix, behavior change): red → green → refactor on the source module's spec.
- Behavior-preserving refactor (deduplication, extraction, renaming): there is no new behavior to drive out, so pin the existing behavior first — add characterization tests that assert the current outputs (rendered prompts, request payloads, emitted events) and confirm they pass against the old implementation before refactoring.
- AI orchestration: prompt content and model output are not deterministic, so assert the *inputs* you hand to the chain (rendered prompt text, variables, parameters) and the *decisions* you take on its structured output — never assert the model's own generated text.

## Commit & Pull Request Guidelines

Git history follows Conventional Commits: `feat:`, `fix:`, `refactor:`, `style:`, `chore:`, with an optional scope such as `feat(resume-ai):`. Summaries may be Chinese or English but must describe the change. Use prefixed branch names (`fix/`, `feature/`, `deploy/`); the default branch is `main`.

Pull requests should reference linked issues, summarize the change and API behavior, pass lint and tests, and include screenshots or request/response examples for user-visible changes.
