# Repository Guidelines

NestJS 11 + TypeScript API for AI-powered resume analysis, backed by MongoDB (Mongoose). Use **pnpm only**; npm and yarn are not allowed.

## Project Structure

- `src/` — application source. One folder per domain module (`user`, `auth`, `resume`, `resume-ai`, `ai`, `template`, `admin`, `common`), each containing `*.module.ts`, `*.controller.ts`, `*.service.ts`, DTOs, and colocated `*.spec.ts` tests.
- `src/common/` — shared infrastructure: global exception filter, response interceptor, upload utilities.
- `test/` — end-to-end tests (`*.e2e-spec.ts`) and mocks.
- `scripts/` — seeders and one-off utilities (e.g. `scripts/seed-templates.ts`); `docs/` and root `*.md` files — architecture/API docs.
- `uploads/` — runtime file storage; `dist/` — build output. Both are gitignored.

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

## Coding Style & Naming Conventions

Prettier enforces 2-space indentation, single quotes, semicolons, and trailing commas. ESLint applies `typescript-eslint` recommended rules plus Prettier with `endOfLine: auto`. TypeScript uses `strictNullChecks`.

Use kebab-case file names (`resume-ai.service.ts`), PascalCase classes, and camelCase methods. Keep unit specs next to their source files.

Hard constraints:

- All external AI calls must go through `src/ai/` (DeepSeek + LangChain).
- Never bypass the global `ResponseInterceptor` / `AllExceptionsFilter`; controllers must not build response envelopes themselves.
- Read configuration through `ConfigService`; never use `process.env` directly.
- Copy `.env.example` to `.env` for local development; never commit `.env` or `uploads/`.

## Testing Guidelines

Use Jest + ts-jest with `@nestjs/testing`; inject mocks via `useValue`. Unit tests (`*.spec.ts`) live beside their source files; E2E tests (`*.e2e-spec.ts`) live in `test/`. Name tests by behavior, e.g. `should reject an invalid resume payload`. Run lint and tests before pushing; run `test:cov` for PRs touching core services.

## Commit & Pull Request Guidelines

Git history follows Conventional Commits: `feat:`, `fix:`, `refactor:`, `style:`, `chore:`, with an optional scope such as `feat(resume-ai):`. Summaries may be Chinese or English but must describe the change. Use prefixed branch names (`fix/`, `feature/`, `deploy/`); the default branch is `dev-main`.

Pull requests should reference linked issues, summarize the change and API behavior, pass lint and tests, and include screenshots or request/response examples for user-visible changes.
