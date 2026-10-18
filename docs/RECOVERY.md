# Backup and recovery

Completed in Phase 7. Current state:

- **Code:** every change is in GitHub; any earlier version can be restored.
- **Database:** development data is synthetic and disposable. Schema can be
  rebuilt by running `supabase/migrations/` in order on a new project.
- **Secrets:** stored only in `.env.local` (your computer) and Vercel/Supabase
  settings. If a key leaks: rotate it in Supabase → API Keys, update
  `.env.local` and Vercel, redeploy.

## Someone can't log in

- **Forgot password (email set up):** they use "Forgot your password?" on the
  log-in page.
- **Forgot password (no email):** in Supabase → SQL Editor, run, replacing
  both values:
  `update auth.users set encrypted_password = extensions.crypt('TEMPORARY-PASSWORD', extensions.gen_salt('bf')) where email = 'player@example.com';`
  Give them the temporary password privately and ask them to change it under
  Account settings.
- **"Not on the invite list":** add their email in Table Editor →
  `signup_allowlist`.

To be added in Phase 7: nightly database dump, restore drill steps,
production checklist.
