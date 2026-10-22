# Backup and recovery

## What protects your data

| Risk | Protection |
| --- | --- |
| Code lost or broken | Every change is in GitHub; any earlier version can be restored. |
| Someone deletes a character by mistake | Restore points on the character; or import it from the player's own export file. |
| Database lost or damaged | **Nightly encrypted backups** on GitHub (kept 14 days), restorable with one workflow. |
| A player wants their data | Account → **Download my data**. |
| A leaked key | Rotate it (see "Leaked key" below). |

Handout **files** (images and PDFs) are not in the database backup. Keep your
own copies of maps and letters you upload; they can be re-uploaded.

## One-time setup: nightly backups (about 10 minutes)

1. **Get the database address.** Supabase → your project → **Connect** (top of
   the page) → **Session pooler** → copy the URI. It looks like
   `postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres`.
   Replace `[YOUR-PASSWORD]` with your database password (the one you saved when
   creating the project; reset it under Project Settings → Database if lost).
   Use the **session pooler** address: GitHub can't reach the direct one.
2. **Choose a backup passphrase**: a long sentence only you know. Save it in
   your password manager. **Without it, backups can't be opened.**
3. **Add both as GitHub secrets**: GitHub → repository → Settings → Secrets and
   variables → Actions → New repository secret:
   - `SUPABASE_DB_URL`: the address from step 1
   - `BACKUP_PASSPHRASE`: the passphrase from step 2
4. **Run it once by hand**: Actions → **Nightly database backup** → Run
   workflow. After a couple of minutes it should be green, with a file
   called `tablekeep-backup-N` under "Artifacts". From now on it runs every
   night at 03:30 UTC (which also stops Supabase's free tier from pausing
   your project).

Never paste these values into chat or code. They're secrets.

## Restore drill (do this once, before launch)

Practise restoring so it works when it matters. Takes about 20 minutes.

1. **Create a temporary empty project** in Supabase, for example
   `tablekeep-restore-test`. Don't run any migrations in it.
2. Copy its **session pooler** address (as in setup step 1) and add it as a
   GitHub secret named `RESTORE_TARGET_DB_URL`.
3. Open your latest green **Nightly database backup** run and copy the number
   at the end of its web address (the run ID).
4. Actions → **Restore a backup** → Run workflow → paste the run ID, type
   `RESTORE`, run.
5. When it's green, open the "Check what came back" step. The counts of user
   accounts, campaigns, characters, templates, spells and messages should
   match your real project.
6. Optional: point a local copy of the app at the test project (its URL and
   publishable key in `.env.local`) and log in with your normal account.
7. **Delete the temporary project** afterwards (Project Settings → General →
   Delete project), and delete the `RESTORE_TARGET_DB_URL` secret. Supabase's
   free plan allows two active projects, and production needs the second.

Write down the date of your drill here: ______________

## Real emergency: the database is gone or badly damaged

1. Create a **new** Supabase project. Don't run migrations in it.
2. Set `RESTORE_TARGET_DB_URL` to its session pooler address.
3. Run **Restore a backup** with the newest good backup's run ID.
4. In the new project, redo the dashboard settings from `docs/SETUP.md`:
   Auth hook (Before User Created), URL configuration, email settings.
   Check Storage has a private `handouts` bucket (the restore recreates its
   settings; files must be re-uploaded).
5. Update Vercel's environment variables (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) to the new project and redeploy.
6. Update the `SUPABASE_DB_URL` secret so nightly backups follow.

## Setting up a brand-new database without a backup

Run `node scripts/combine-migrations.mjs`, then paste
`supabase/all-migrations.sql` into the new project's SQL Editor and run it
once. Then do the dashboard settings from `docs/SETUP.md`.

## Someone can't log in

- **Forgot password (email set up):** "Forgot your password?" on the log-in page.
- **Forgot password (no email):** in Supabase → SQL Editor, run, replacing
  both values:
  `update auth.users set encrypted_password = extensions.crypt('TEMPORARY-PASSWORD', extensions.gen_salt('bf')) where email = 'player@example.com';`
  Give them the temporary password privately and ask them to change it under
  Account settings.
- **"Not on the invite list":** add their email in Table Editor → `signup_allowlist`.

## Leaked key

- **Publishable key or project URL:** these are designed to be public; the
  database rules protect the data. No action needed.
- **Database password / `SUPABASE_DB_URL`:** Supabase → Project Settings →
  Database → reset the password, then update the `SUPABASE_DB_URL` secret.
- **Backup passphrase:** choose a new one and update `BACKUP_PASSPHRASE`.
  Old backups stay encrypted with the old one until they expire (14 days).
- **The secret / service_role key:** the app never uses it. If it leaked
  anyway, rotate it under Project Settings → API Keys.
