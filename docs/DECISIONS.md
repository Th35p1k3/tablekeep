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
The app is called Tablekeep. Downloads were numbered 1.N.0 through Phase 1
and are numbered 2.N.0 from Phase 2 (starting at 2.0.0), with N increasing by
1 per change. `VERSION`, `package.json` and `CHANGELOG.md` must agree.

## ADR-009 Cache Components stay on
New Next.js projects enable Cache Components. Pages are pre-built by default;
anything live (database reads) goes inside `<Suspense>` and calls
`connection()` or uses the data APIs that opt out of caching.

## ADR-010 Invite-only sign-up enforced by the database
A "Before User Created" auth hook checks `signup_allowlist`. Hiding the
sign-up page would not be enough: anyone could call Supabase directly.

## ADR-011 Account deletion without the secret key
`delete_my_account()` runs with elevated rights but only ever deletes the
caller. The service-role key never enters the app or Vercel.

## ADR-012 Email links verified with token hashes
Email templates link to `/auth/confirm?token_hash=...`, which works even
when the link is opened on a different device from the one used to sign up.

## ADR-013 Own small form components instead of shadcn/ui (for now)
Five small components cover Phase 1. Revisit when screens get richer.

## ADR-014 Game system is a text label for now
Campaigns store `game_system` as plain text. A full `game_systems` table
arrives with sheet templates in Phase 3, when something actually needs it.

## ADR-015 Membership changes only through database functions
Joining, role changes, removals, leaving, ownership transfer and deletion
are database functions that check permissions themselves. Members can only
read the membership table directly, never write it.

## ADR-016 Invite links are hashed and shown once
Only a SHA-256 hash of each invite token is stored, and nobody can read even
the hash. The full link is shown once, right after it is created.

## ADR-017 One owner per campaign
Enforced by a unique index. Owners must hand over or delete their campaigns
before leaving them or deleting their account.

## ADR-018 Custom formula engine (detail for ADR-006)
`src/lib/formula` tokenizes, parses into a tree and evaluates. It knows only
numbers, true/false, field names, + - * /, comparisons, and/or/not, and the
functions floor, ceil, round, abs, min, max, clamp, if. Limits: 500
characters, 200 pieces, 32 levels of nesting. Field values are looked up
through Maps, never plain objects, so names like `constructor` reach nothing.

## ADR-019 Templates: one editable draft, frozen published versions
Each template has at most one draft. Publishing turns it into the next
numbered version, which a database trigger then refuses to change.
Characters (Phase 4) will point at a specific published version.

## ADR-020 Template definitions are checked by the app, stored as JSON
The database only checks that a definition is a JSON object under 256 KB.
The app validates the full structure and every formula before saving, and
re-checks when loading, so a bad definition can't break a sheet.
