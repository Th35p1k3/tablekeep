# Changelog

Every download is numbered 1.N.0; N goes up by 1 with each change.

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
