# Changelog

Every download is numbered 1.N.0; N goes up by 1 with each change.

## 1.5.0 (2026-10-18)
- Browser tests: wait up to 15 seconds for page content and run at most
  4 tests at once locally (2 on GitHub), fixing a timing-only failure of the
  phone log-in test.

## 1.4.0 (2026-10-18)
- Fixed the "Date.now() while prerendering" error on Home, Account and the
  password reset page: login checks now always run at request time.
- Clear message when Supabase rejects an email address (e.g. example.com).
- Unexpected auth, profile and delete errors are printed in the terminal.
- Docs: test accounts use plus-addresses of a real mailbox.

## 1.3.0 (2026-10-18)
- Phase 1 accounts: sign up, log in, log out, forgot/reset password,
  Home placeholder, Account settings (display name, password, delete).
- Invite-only sign-up checked by the database (`signup_allowlist` + hook).
- Migration 0002: profiles with Row Level Security, sign-up trigger,
  invite-list hook, `delete_my_account()`.
- Session handling in `src/proxy.ts`; signed-out visitors redirected.
- Tests: form rules, error messages, two-user security test, browser tests
  for redirects, form errors and log in/out.
- CI reads Supabase and test-user settings from GitHub secrets.

## 1.2.0 (2026-10-17)
- Fixed the `/health` page for Next.js Cache Components: removed the
  `dynamic` setting, added `connection()` and a loading message.
- Vitest now uses Vite's built-in tsconfig path support; the
  `vite-tsconfig-paths` package is no longer needed.

## 1.1.0 (2026-10-17)
- Named the app **Tablekeep** (page titles, home heading, tests, docs).
- Added `VERSION` and this changelog.

## 1.0.0 (2026-10-17)
- Phase 0 foundation: Next.js overlay, `/health` database check,
  Vitest and Playwright tests, GitHub Actions CI, health_check migration,
  setup, decisions and recovery docs.
