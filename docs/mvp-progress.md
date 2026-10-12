# Local MVP delivery evidence

## Starting state (2026-10-12)

Before editing, recorded `git status --short`, full tracked diff, and untracked inventory in `/tmp/fantasy-start-{status,diff,untracked}.txt`. Existing changes: `.env.example`, `.gitignore`, `IMPLEMENTATION.md`, `README.md`, `supabase/config.toml`; existing untracked app/auth scaffold, package/config/lock files, `AGENTS.md`, `DEVELOPMENT_PLAN.md`, and auth tests. Environment files were not read or modified. Existing scaffold changes remain outside implementation commits unless explicitly reviewed as integration prerequisites.

## M0 — baseline and repeatable infrastructure

- Local stack: approved loopback API 54321 / PostgreSQL 54322, migration `20261012042000` applied. Existing data retained: 30 teams, 582 players, 1,230 games, 26,651 appearances; `data/CURRENT` unchanged.
- Fresh lint and type checking passed. Full Python discovery: 12 tests passed, including transactional repeat import and injected-failure rollback, zero skips.
- Strict SQL runner: 18 original pgTAP assertions passed; fixtures rolled back. Parser negative/positive suite: 10 tests passed.
- Development auth browser suite: 2 passed, zero retries/skips. Production auth browser suite: 2 passed, zero retries/skips, build/runtime both explicitly use the same local public variables.
- Default Turbopack production build failed on CSS-worker port binding (`Operation not permitted`) both under normal and expanded execution permissions. Supported `next build --webpack` passed, preserving CSS and framework/dependency versions. `npm run build` and production browser runner now select webpack. Supabase/socket/browser execution needs expanded execution permissions in this agent sandbox.
- Added local-only runners, checked temporary account teardown, fail-closed full-data runner, and synthetic CI fixture infrastructure. Concurrency runner intentionally fails with no tests until M1 adds the scenarios; it does not report empty discovery as success.
- Ordinary CI is synthetic; full-data validation remains a separate required local gate. CI workflow execution on GitHub is not claimed as performed locally.

Subsequent milestone results are appended after their combined gates pass.
