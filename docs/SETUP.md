# Setup

## Tools (install once)

- Node.js LTS (22 or newer): https://nodejs.org
- Git: https://git-scm.com
- A code editor (VS Code) and, ideally, Claude Code

Check: `node --version` and `git --version` both print a version.

## Accounts (create once, you own them)

- GitHub – stores the code
- Supabase – database and login
- Vercel – hosting (sign in with GitHub)

## Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Where to find it | Secret? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | No |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → publishable (or "anon public") | No, protected by Row Level Security |

Never put the Supabase **secret / service_role** key in `.env.local`,
in Vercel for this app, in chat, or in git.

The same two variables go into Vercel → Project → Settings → Environment
Variables.

## Database migrations

Until we add the Supabase CLI, apply each file in `supabase/migrations/`
in number order: Supabase dashboard → SQL Editor → New query → paste → Run.
Record which ones you have run in the table below.

| Migration | Dev applied | Prod applied |
| --- | --- | --- |
| 0001_health_check.sql | | |

## Environments

- **Development:** Supabase project `tablekeep-dev`, local `.env.local`
- **Production:** a separate Supabase project, created in Phase 7
