# Tablekeep

A web app where Dungeon Masters and players run campaigns, build custom
character sheets and spells, and share campaign tools. Edition-agnostic and
homebrew-first: it ships with no proprietary game content.

**Version:** 4.1.1 · **Status:** Phase 5 (spells and homebrew), step 5a. See the project plan doc for the roadmap.

## Quick start

1. Follow `docs/SETUP.md` once to install tools and connect Supabase.
2. `npm run dev` and open http://localhost:3000
3. Visit `/health` to confirm the database connection.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs the app locally with live reload |
| `npm run lint` | Checks code style and common mistakes |
| `npm run typecheck` | Checks TypeScript types |
| `npm test` | Runs unit tests (Vitest) |
| `npm run test:e2e` | Runs browser tests (Playwright), desktop and phone |
| `npm run build` | Production build |

## Docs

- `docs/SETUP.md` – first-time setup, environment variables
- `docs/DECISIONS.md` – why each technology was chosen
- `docs/RECOVERY.md` – backups and restore (completed in Phase 7)
- `supabase/migrations/` – every database change, numbered, in order
