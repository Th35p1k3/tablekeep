# Architecture decisions

Each entry: the decision, why, and what we gave up. Newest last.

## ADR-001 Next.js + TypeScript
One language and one project for pages and server code; large community.
Gave up: a separate backend that could be swapped independently.

## ADR-002 Supabase (Postgres, Auth, Storage, Realtime)
Standard Postgres with login, files and live updates built in, so we run no
servers. Gave up: some vendor lock-in for auth/realtime; data stays portable
because it is plain Postgres.

## ADR-003 Security in the database (Row Level Security)
Every table gets RLS policies; server code repeats checks; screens only hide
buttons. A UI bug cannot leak another campaign's data.

## ADR-004 Vercel hosting, GitHub Actions CI
Automatic preview link per change; tests run on every push.

## ADR-005 Tests: Vitest + Playwright (desktop and phone)
Nothing is called done until tests pass and the output has been seen.

## ADR-006 Custom formula engine (Phase 3)
No `eval`, no general-purpose math library: an allow-listed expression
evaluator with limits, written and tested in Phase 3.

## ADR-007 Migrations applied by hand (Phase 0–1)
SQL files pasted into the Supabase SQL editor, tracked in SETUP.md. Revisit:
switch to the Supabase CLI once there is more than one environment.

## ADR-008 Name and version numbers
The app is called Tablekeep. Downloads are numbered 1.N.0, with N increasing
by 1 per change; `VERSION`, `package.json` and `CHANGELOG.md` must agree.

## ADR-009 Cache Components stay on
New Next.js projects enable Cache Components. Pages are pre-built by default;
anything live (database reads) goes inside `<Suspense>` and calls
`connection()` or uses the data APIs that opt out of caching.
