# Changelog

Downloads were numbered 1.N.0 through Phase 1 and are numbered 2.N.0 from
Phase 2; N goes up by 1 with each change.

## 2.1.0 (2026-10-18)
- Log out now signs out only the current device instead of every device.
  This also fixes the campaign browser test, which was being logged out by
  the log-out test running at the same time with the same test account.

## 2.0.0 (2026-10-18)
- Phase 2 campaigns and membership: create, edit, archive, restore and
  delete campaigns; Home lists your campaigns with your role.
- Invite links with expiry and use limits, shown once, cancellable.
  Invite page works for signed-out visitors and returns them after login.
- Members page; owners change roles (Co-DM/Player), remove members and hand
  over the campaign; Co-DMs can remove Players; members can leave.
- Migration 0003: campaigns, members and invites with Row Level Security,
  permission-checking functions, fellow members can see each other's names,
  account deletion blocked while you own a campaign.
- Tests: campaign permission suite (owner, co-DM, player, outsider),
  invite edge cases, browser test of create, invite and join.
- Third test account (Test C) used as the outsider.

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
