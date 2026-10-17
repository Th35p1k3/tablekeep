# Backup and recovery

Completed in Phase 7. Current state:

- **Code:** every change is in GitHub; any earlier version can be restored.
- **Database:** development data is synthetic and disposable. Schema can be
  rebuilt by running `supabase/migrations/` in order on a new project.
- **Secrets:** stored only in `.env.local` (your computer) and Vercel/Supabase
  settings. If a key leaks: rotate it in Supabase → API Keys, update
  `.env.local` and Vercel, redeploy.

To be added in Phase 7: nightly database dump, restore drill steps,
production checklist.
