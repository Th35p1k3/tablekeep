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
and 2.N.0 through Phase 3. From Phase 4 they are numbered 3.N.P: N goes up
by 1 for each build step (4a = 3.1.0, 4b = 3.2.0) and P by 1 for each small
fix in between (3.1.1, 3.1.2 …), resetting at the next step. From Phase 5
they are 4.N.P in the same way (5a = 4.1.0, 5b = 4.2.0), and from Phase 6
5.N.P (6a = 5.1.0, 6b = 5.2.0, 6c = 5.3.0), and from Phase 7 6.N.P
(7a = 6.1.0, 7b = 6.2.0). `VERSION`,
`package.json` and `CHANGELOG.md` must agree.

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

## ADR-021 Builder saves drafts with unfinished formulas
"Save draft" only requires a valid layout (names, labels, options), so work
in progress isn't lost. "Publish" requires every check to pass, and the
server re-checks both.

## ADR-022 Reorder with buttons, not drag-and-drop
Up/down buttons work the same with a mouse, a finger or a keyboard, and are
far more reliable on phones. Moving a field to another section means
deleting it and adding it there (may improve later).

## ADR-023 One sheet component for previews and characters
`SheetView` renders any template with live calculations. The builder's
preview uses it now; Phase 4 character sheets will use the same component.

## ADR-024 Characters are pinned to a published template version
A character points at one exact version. Template versions in use can't be
deleted, and deleting a template that characters use is refused with a
clear message. Upgrading characters to newer versions is a Version 2 feature.

## ADR-025 Autosave refuses to overwrite newer changes
Every save sends the timestamp of the version the browser last saw. If the
character changed elsewhere in the meantime (another tab, another device),
nothing is written and the sheet asks you to reload. After a failed save it
waits for your next change rather than retrying in a loop.

## ADR-026 Restore points
Saved by hand any time, and automatically just before a restore (so a
restore can itself be undone). The newest 50 per character are kept.

## ADR-027 Campaigns offer templates
A DM offers published versions of their own templates to a campaign;
members can build characters from them. Withdrawing an offer doesn't break
existing characters: anyone who can see a character can read its template.

## ADR-028 Who sees a character
Owner always; the campaign's DM and Co-DMs always (read-only); other players
only when the campaign's "players see full sheets" setting is on. Everyone
in the campaign sees the party list (names, players, templates) through a
database function that returns nothing else.

## ADR-029 Leaving takes your characters with you
Removing or leaving a campaign also removes that person's characters from
its party (a database trigger). Characters themselves are never deleted.
Accounts can't be deleted while other players' characters use their
templates.

## ADR-030 Spells work like templates
One editable draft, frozen numbered versions. Characters (and, in 5b,
campaign approvals) point at an exact version. Spells in use can't be
deleted.

## ADR-031 Edition-agnostic spell content
Only a name and description are required. Common properties (level,
category, casting time, range, area, duration, components, concentration,
ritual, tags) are optional, plus up to 20 custom label/value properties.
Effects are typed blocks: damage, healing, saving throw, attack roll,
condition, area, custom text.

## ADR-032 Dice text is checked, not rolled (yet)
`checkDice` accepts dice (NdM), whole numbers and modifier names joined with
+ or -, and reports range and average when it can. The dice roller is a
Version 2 feature and will reuse it.

## ADR-033 Effect presets are copied, not linked
Inserting a preset copies the block into the spell. Editing or deleting a
preset never changes existing spells.

## ADR-034 Approvals are for exact versions
A submission is for one published version. Approving a spell adds that
version to the campaign's spell list; approving a template offers that
version. Newer versions need their own approval; older approved versions
keep working.

## ADR-035 "Approved spells only" is a campaign setting, on by default
With it on, characters in the campaign can only take spells on the
campaign list (DMs add their own directly; players' go through the queue).
Spells already on a character before it joined stay. With it off, players
may also use their own published spells.

## ADR-036 Asking for changes requires a note
Approve and reject may have a note; "request changes" must say what to
change. Reviews happen once; a new submission starts a new review.

## ADR-037 Campaign pages are tabs
Overview, Party, Spells, Logs, plus DM notes, Approvals, Activity and
Settings for DMs. Each tab is its own page and address, so links and the
Back button work, and each loads only what it shows.

## ADR-038 DM-only material is separated by the database
DM notes have their own table readable only by DMs and Co-DMs. DM-only
session logs are filtered by the database's read rules, so they never
reach a player's browser even if a page has a bug.

## ADR-039 The activity log is written by the database
Triggers record important changes (members, roles, settings, reviews,
invites, campaign spell and template lists, deleted logs and
announcements). Nobody can write to it directly, so it can't be faked.
Entries are skipped while a campaign is being deleted.

## ADR-040 Whispers go DM ↔ players only (Phase 6b)
Chosen as the default: DMs can whisper to any players; players can whisper
back to DMs but not to each other.

## ADR-041 Live chat through Supabase Realtime
The browser subscribes to new, edited and deleted messages for one
campaign. The database's read rules apply to live updates too, so whispers
never reach anyone else's browser. More than 10 messages in 10 seconds from
one person is refused. Because live connections can miss a message sent
while they open, chat also catches up on connect, on returning to the tab,
and every 8 seconds while visible.

## ADR-042 Handout files upload straight from the browser
Files go directly to a private storage bucket at
<campaign>/<handout>/<file>, avoiding the server's upload size limits.
Storage rules let only DMs and Co-DMs upload and delete, and let people
view a file only if they can see its handout. Links to files are signed and
expire after 10 minutes. Images (JPG, PNG, WebP) and PDFs up to 10 MB.

## ADR-043 Dice are rolled by the database
Roll requests are rolled inside the database with secure random bytes, and
saved immediately, once per player per request. Nobody can fake, predict or
re-roll a die. The sheet modifier is read by the app from the player's own
character and recorded separately next to the dice, so the DM can compare
it with the sheet. (Without the database's master key the app can't prove
the modifier; a player could in principle send a false one.)

## ADR-044 Roll results are private unless shared
Results are seen by the DM and the roller. "Show results in chat" posts
each result as a chat message from the roller. Players can also type in a
result rolled with real dice; it's marked as such.

## ADR-045 Export and import
"Download my data" gives one JSON file with everything a person made, plus
the messages and logs they wrote; never other people's data. Import adds
characters (with a copy of their sheet template), spells, templates and
presets to any account, one item at a time, re-checking everything and
reusing identical templates and spells already in the account.

## ADR-046 Encrypted nightly backups on GitHub
A scheduled GitHub workflow dumps roles, schema and data with the Supabase
CLI, encrypts the result with a passphrase only the owner holds, and keeps
it as a workflow artifact for 14 days. A second workflow restores a chosen
backup into an empty project and reports row counts, used for the restore
drill and for real recoveries. Handout files are not included.
