# Changelog

Downloads were numbered 1.N.0 through Phase 1 and 2.N.0 through Phase 3.
From Phase 4 they are 3.N.P, from Phase 5 4.N.P and from Phase 6 5.N.P:
N for each build step, P for small fixes.

## 5.1.0 (2026-10-21)
- Phase 6, step 6a: campaign tools.
  - Campaign pages split into tabs: Overview, Party, Spells, Logs, and for
    DMs: DM notes, Approvals (with a pending count), Activity, Settings.
  - Announcements on the Overview: post, pin, edit, delete (DMs).
  - Session logs with number, date, title and recap; visible to everyone
    or DMs only. Players can write their own when the DM allows it.
  - Private DM notes, optionally linked to a character or a session log.
  - Activity log of important DM actions, recorded by the database.
- Forms that appear more than once on a page now have unique field ids.
- Migration 0009: announcements, session logs, DM notes, activity log.
- Tests: rules and activity wording tests; security tests that players
  and outsiders never see DM-only logs, DM notes or the activity log;
  browser test with a DM and a player. Three browser tests updated for tabs.
- Version numbering moves to 5.N.P.

## 4.2.0 (2026-10-21)
- Phase 5, step 5b: homebrew approval.
  - Players submit published spells and sheet templates to a campaign,
    with an optional note, and can withdraw while waiting.
  - DMs get an approval queue (with a pending count on the campaign page):
    spell card or sheet preview, the player's note, and Approve / Request
    changes / Don't approve with a note to the player.
  - Campaign spell list on the campaign page; DMs add their own spells in
    settings and can remove spells from the list.
  - "Approved spells only" campaign setting (on by default) controls which
    spells characters in the campaign can take.
- Migration 0008: submissions, campaign spells, wider read rules for
  reviewers and members, the campaign spell rule.
- Tests: review rule tests; homebrew security tests; browser test of a
  player submitting and a DM approving.

## 4.1.1 (2026-10-21)
- The "Prepared" checkbox on a character's spells now ticks instantly and
  saves in the background, undoing itself with a message if saving fails.
  Previously it only changed after the server replied, which felt
  unresponsive and failed the spell browser test.

## 4.1.0 (2026-10-21)
- Phase 5, step 5a: custom spells.
  - My spells list; new spell; builder with basics, custom properties and
    effect blocks (damage, healing, saving throw, attack roll, condition,
    area, custom text), each with an optional "at higher levels" note.
  - Dice checked as you type, with range and average.
  - Effect presets: save any block, insert it into other spells.
  - Live spell card preview; drafts, publish version N, make changes,
    discard, copy, rename, delete.
  - Spells card on characters: add published spells, mark prepared, open
    the spell card, remove. DMs see a character's spells read-only.
- Migration 0007: spells, versions, presets, character spells, with
  owner-only access and viewers of a character able to read its spells.
- Tests: dice and spell rule tests; spell security tests; browser test
  that builds a spell and prepares it on a character.
- Version numbering moves to 4.N.P.

## 3.2.0 (2026-10-21)
- Phase 4, step 4b: characters in campaigns.
  - Inventory on every character: add, edit, remove, quantity buttons,
    total weight.
  - DMs offer their published templates in campaign settings; players see
    them on the campaign page and when creating a character.
  - Add a character to a campaign (from the character or the campaign);
    one campaign per character; owners and DMs can remove.
  - Party list on the campaign page. DMs open characters read-only;
    players see names unless the DM allows full sheets.
- Leaving or being removed from a campaign takes your characters out of
  its party. Account deletion is refused while others use your templates.
- Migration 0006: inventory, offered templates, party, visibility rules.
- Tests: inventory rules; party and visibility security tests; browser
  test with a DM and a player.

## 3.1.0 (2026-10-21)
- Phase 4, step 4a: characters.
  - My characters list and New character (from any published version of
    your templates). Characters stay on that exact version.
  - Character sheet with live calculations, saved automatically a moment
    after you stop typing, with protection against two devices
    overwriting each other.
  - Refill buttons for each resource, plus "Refill all resources".
  - Restore points: save, restore (the current sheet is saved first) and
    delete. Rename, copy and delete characters.
- Templates in use by a character can no longer be deleted.
- Migration 0005: characters and restore points with owner-only access.
- Tests: character data and refill tests; character security tests
  (strangers, drafts, autosave conflicts, restore points); browser test of
  creating and playing a character.
- Version numbering moves to 3.N.P.

## 2.4.0 (2026-10-21)
- Phase 3, step 3b: sheet template screens.
  - My templates list with version and draft badges; link from Home.
  - New template from the example sheet or blank.
  - Builder: sections and fields, up/down reordering, every field type's
    settings, short names that follow the label, formula hints, problems
    shown per field and in a summary.
  - Live preview beside the builder (below it on phones).
  - Save draft, publish version N, discard draft, make changes to a
    published template, copy, delete, edit name and description.
- Reusable `SheetView` component for Phase 4 character sheets.
- Tests: 26 builder helper tests; browser test that builds, tests,
  publishes and deletes a template.

## 2.3.0 (2026-10-21)
- Phase 3, step 3a: formula engine (`src/lib/formula`) with friendly error
  messages, limits and protection against hostile formulas.
- Template definitions (`src/lib/templates`): seven field types, full
  validation (names, formulas, missing fields, circles), sheet calculation
  that contains problems to the field that has them, and an original
  starter sheet.
- Migration 0004: templates with one draft and frozen numbered versions,
  owner-only access, publish/new draft/discard/copy/delete actions.
- Tests: 114 formula and template tests, plus template storage and
  version security tests against the database. No new screens yet.

## 2.2.0 (2026-10-21)
- Campaign browser test: after deleting, check only visible links on Home.
  Next.js keeps recently visited pages loaded but hidden for instant Back
  navigation, and the old check counted that hidden text.

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
