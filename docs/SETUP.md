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
| 0002_accounts.sql | | |
| 0003_campaigns.sql | | |
| 0004_templates.sql | | |
| 0005_characters.sql | | |
| 0006_party.sql | | |
| 0007_spells.sql | | |
| 0008_homebrew.sql | | |
| 0009_campaign_tools.sql | | |
| 0010_chat_handouts.sql | | |

## Environments

- **Development:** Supabase project `tablekeep-dev`, local `.env.local`
- **Production:** a separate Supabase project, created in Phase 7

## Accounts setup (Phase 1, once per Supabase project)

1. **Run migration 0002** in SQL Editor (see table above).
2. **Turn on the invite-list check:** Authentication → Hooks → add a
   "Before User Created" hook → type Postgres → schema `public` →
   function `hook_before_user_created` → save.
3. **Add allowed emails:** Table Editor → `signup_allowlist` → Insert row →
   type the email (note is optional). Add yours, your players', and the two
   test accounts.
4. **Web addresses:** Authentication → URL Configuration.
   - Site URL: your Vercel address (or `http://localhost:3000` until then).
   - Redirect URLs: add `http://localhost:3000/**` and
     `https://YOUR-APP.vercel.app/**`.
5. **Email sending (Gmail, free):**
   - Create a Gmail account just for Tablekeep. Turn on 2-Step Verification,
     then Google Account → Security → App passwords → create one named
     "Supabase". Copy the 16-character password into your password manager.
   - Supabase → Authentication → Emails → SMTP Settings → enable custom SMTP:
     host `smtp.gmail.com`, port `587`, username = the Gmail address,
     password = the app password, sender email = the Gmail address,
     sender name `Tablekeep`.
   - The app password lives only in Supabase. Never put it in code or chat.
6. **Email templates:** Authentication → Emails → Templates.
   - Confirm signup, message body link:
     `<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email">Confirm my email</a>`
   - Reset password, message body link:
     `<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery">Choose a new password</a>`
7. **No-email alternative:** Authentication → Sign In / Providers → Email →
   turn off "Confirm email". Sign-up then works without email, but
   "Forgot password" won't send anything (see RECOVERY.md for manual resets).

## Test accounts (for the automated security tests)

Use "plus" addresses of a real mailbox, for example
`yourname+testa@gmail.com` and `yourname+testb@gmail.com`. Supabase rejects
made-up domains such as `@example.com`. Add both to `signup_allowlist`, sign
up through the app (confirm both emails if confirmation is on), then put the
four values in `.env.local`:

| Variable | Value |
| --- | --- |
| `TEST_USER_A_EMAIL` / `TEST_USER_A_PASSWORD` | first test account |
| `TEST_USER_B_EMAIL` / `TEST_USER_B_PASSWORD` | second test account |
| `TEST_USER_C_EMAIL` / `TEST_USER_C_PASSWORD` | third test account: the "outsider". Never add it to a campaign by hand. |

Use made-up passwords for these, never a real one.

## GitHub Actions secrets

GitHub → repository → Settings → Secrets and variables → Actions →
New repository secret. Add the same eight names and values as `.env.local`.
Tests that need them are skipped if they're missing.

## Test data notes (Phase 2)

The automated tests create campaigns named `[test] ...` and delete them when
they finish. If a test run is interrupted, a leftover `[test]` campaign may
remain: log in as Test A and delete it from its Settings page. If Test C is
left inside a campaign, the "stranger" security test will fail until it is
removed.

## Live chat and file storage (Phase 6b)

Migration 0010 turns on live updates for chat and creates a private storage
bucket called `handouts`. Nothing else to click. To check: Supabase →
Storage should list `handouts` (Private), and Database → Publications →
`supabase_realtime` should include `messages`.

Free-tier limits worth knowing: 1 GB of file storage and a generous number
of live connections, far more than a friends group needs.
