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

## M1 — authorization and transactions

- Added rollback-only authorization/invariant SQL: original 18 plus 190 expanded assertions passed. Covers all shared/private tables, both real fixture owners, anonymous access, column grants, crafted ownership, bounds, invalid replacement with exact snapshots, and nonvacuous account cascades.
- Independent-transaction suite: 8 tests passed, each proving a competing backend waits on the first transaction via `pg_blocking_pids` before commit. Covers all required race scenarios and both save/member-change serial orders.
- Production browser/API suite: 4 tests passed (2 auth, 2 real two-user authenticated Supabase API security tests). Lint/typecheck passed; production build reproduced in that run. Full-data discovery: 22 tests passed, zero skips, including original 12 and new race/fixture tests.
- Independent migration review found no concrete security/transaction defect. No migration changed. Existing locking RPCs, importer and session clients retained.
- Worker reruns briefly encountered approval-review HTTP 429 infrastructure failures; coordinator reruns executed successfully. No required check remains blocked.
- Next: M2 player queries and bounded historical browsing.

## M2 — player directory and history

- Added `/players` search and stable 20-row pages, `/players/[id]` averages and recent-first 20-row history, unknown positions, empty/missing/import-error states and navigation.
- Migration `20261012060000_player_directory.sql` adds authenticated security-invoker season/history views; applied locally without reset. Teams and opponents derive from recorded appearances/games.
- SQL gate: 251 assertions passed (18 + 190 + 43 synthetic query assertions). Eight transaction regressions passed. Validation unit suite: 2 tests passed. Synthetic fixture safety: 2 tests; actual rollback insertion checks: 11 assertions passed.
- Full production suite: 12 passed. The error-retry check exposed that the inherited `reset()` button did not refetch Server Components; switched to installed Next.js `retry()` API and reproduced both targeted state tests (2 passed) with a fresh production build. Lint/typecheck passed after the final change.
- Independent query/migration review found no authorization, cache-sharing, or bounded-query defect. No required checks skipped. Next: M3 roster and watchlist mutations.
