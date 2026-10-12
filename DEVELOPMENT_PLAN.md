# Fantasy Roster Planner — Agent Development Plan

Prepared 2026-10-12 from the working repository. `IMPLEMENTATION.md` remains the product specification; this document supplies the remaining delivery sequence, testing requirements, and quality gates. Implement the existing MVP only.

## 1. Starting point and evidence

The repository is partway through implementation, not a blank scaffold. Preserve the current modified and untracked files. Do not reset, clean, overwrite environment files, or assume untracked application files are disposable.

| Area | Observed state | Next action |
| --- | --- | --- |
| Dataset | Existing version selected by `data/CURRENT`; documented 30 teams, 582 players, 1,230 games, 26,651 appearances | Reuse it; no collection or feasibility rerun |
| Database | Initial migration, RLS, averages view, import metadata, locking RPCs exist | Extend security and concurrency verification before adding product mutations |
| Importer | Validation and transactional publication implemented | Retain repeat-import and rollback regression coverage |
| App | Next.js 16.4.0, React 19.3.0, TypeScript, Tailwind, session-bound Supabase clients and proxy | Extend existing architecture |
| Auth | Signup, sign-in/out, password recovery/update, callbacks, protected layout, roster initialization | Preserve both confirmation behaviors; broaden tests |
| Product | Dashboard currently displays the initialized roster name and a placeholder | Build players, roster controls, watchlist, then lineups/dashboard |
| Browser tests | Two auth workflows; configuration targets local Supabase and starts `next dev` on port 3101 | Add product workflows and a production-server mode |
| Hosting | Hosted schema/data, email delivery, redirects, and Vercel deployment not verified in this review | Prepare release evidence after local MVP gates |

Fresh verification during this review:

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- Python discovery: all 12 tests passed with `SUPABASE_TEST_DB_URL` pointed at local Supabase, including repeat-import and injected-failure rollback. Without that variable, the integration test is skipped.
- `supabase/tests/roster_planner.sql`: all 18 pgTAP assertions passed against local Supabase; fixtures rolled back.
- `npm run test:auth`: both Playwright workflows passed against local Supabase; temporary accounts cleaned up.
- `npm run build`: failed in this execution environment when the Turbopack CSS worker attempted to bind a local port (`Operation not permitted`). A retry with expanded execution permissions failed the same way. This review does **not** establish a passing production build; the next agent must verify it in an environment that supports the worker.

The existing SQL tests cover some two-user behavior, but do not cover the full private-table mutation matrix or concurrent transactions. Token-hash callback coverage uses generated local links; it does not prove confirmation-enabled signup, real inbox delivery, or same-browser PKCE exchange.

## 2. Temporary email-confirmation policy

The user temporarily disabled hosted email confirmation after reaching email rate limits. Local `[auth.email].enable_confirmations` is also `false`. The hosted setting is user-reported; this review did not inspect the hosted project. Editing local `supabase/config.toml` does not establish the hosted setting.

Development instructions:

- Keep confirmation disabled for normal development. Do not change hosted Auth settings or require hosted email before implementing product features.
- Preserve the existing signup behavior: a returned session redirects to `/dashboard`; signup without a session displays confirmation instructions. Do not hardcode an automatic login or remove callbacks.
- Disabling confirmation does not remove password-reset email requests. Run signup/recovery loops against local Supabase and its mail viewer, never the hosted free-tier mail service.
- Test confirmation-enabled behavior in a separate disposable local configuration/stack or a controlled local test run. Restore the normal local setting afterward. Do not toggle a shared stack while other tests are running.
- Add deterministic coverage for signup email/request throttling and recovery-send failure using a controlled test boundary, without exhausting a real provider. Assert understandable errors, no retry loop, and no false success/session.
- Keep password-reset responses account-neutral; preserve safe callback destinations and invalid/expired-link handling. Never log passwords, tokens, callback URLs containing tokens, or privileged credentials.

Release evidence must record the intended production confirmation setting explicitly. The default release plan is to restore confirmation and verify it after the email configuration is ready. A release that retains disabled confirmation needs an explicit user decision; the implementing agent must not silently carry the temporary setting into a claimed production-ready release. No paid mail service or plan upgrade is authorized by this plan.

## 3. Agent operating instructions

1. Read `AGENTS.md`, `IMPLEMENTATION.md`, this plan, and relevant existing code before editing. Read the installed Next.js guides in `node_modules/next/dist/docs/` for the feature being changed. Start with `01-app/02-guides/server-actions.md`, `authentication.md`, `testing/playwright.md`, and relevant routing/cache guides. Use supported APIs from the installed version.
2. Record `git status --short` and a fresh baseline. Preserve the user's existing work. Keep changes focused; do not upgrade dependencies or rewrite functioning auth/import code without a concrete requirement.
3. Work through the milestones below in order. Each feature includes implementation and verification in the same milestone. Do not accumulate several untested features and postpone integration until the end.
4. Authenticate inside every server mutation and private-data entry point. Protected layouts and hidden buttons are not authorization. Use the existing session-bound client so RLS applies. Derive ownership from the session, never a submitted `user_id`.
5. Use `ensure_roster`, `add_roster_player`, `remove_roster_player`, and `save_lineup` for their existing operations. Do not bypass capacity/lineup invariants with direct table writes or application service-role clients.
6. Prefer server-rendered bounded reads, small interactive components, explicit domain types, and shared server validation where useful. Validate IDs, page/search parameters, names, notes, ordered starters, and date-only strings on the server. Return useful application errors without exposing raw database details.
7. Maintain migrations as versioned changes. Do not rewrite an already-applied migration to hide a schema fix. Keep private user data out of shared caches; verify session changes and mutation revalidation against installed Next.js documentation.
8. Use local disposable test resources. Privileged test credentials are allowed only in isolated fixture/setup code and must never reach the app or browser. Do not print `.env`/`.env.local` or raw `supabase status` JSON.
9. Resolve routine choices autonomously and continue after passing a gate. Ask only when progress requires a scope/cost decision, external account access, or an action outside the authorized implementation scope. Cloud mutation, publication, and paid services are not authorized merely by this planning document.
10. At each milestone, report files changed, implemented behavior, commands/assertion counts, skips, remaining failures, and the next milestone. Update progress evidence in the docs; never label a blocked or skipped check as passed.

### Commit history and agent coordination

- Record the starting tracked diff and untracked-file inventory before implementation. Keep unrelated existing changes out of implementation commits; do not silently absorb the user's work into an agent commit. Review overlapping existing changes before staging.
- Make small, coherent commits that include a behavior change or fix, its relevant tests, and necessary documentation or migrations. Split independent changes into separate commits; avoid mixing unrelated refactors with feature work.
- Commit completed work after the applicable quality gates pass. If a check is environment-blocked, record the exact check and prerequisite in the milestone evidence and commit description; a checkpoint commit does not establish milestone completion. Fix failing required assertions before treating the work as complete.
- Stage explicit paths or reviewed hunks, rather than using blanket staging. Inspect the staged diff and run `git diff --cached --check` before each commit. Check for unrelated edits, credentials, environment files, generated artifacts, and accidental dataset inclusion.
- Use descriptive commit messages that explain the implemented behavior or corrected defect. Include meaningful validation evidence and any blocked checks in the commit body when needed; avoid vague messages such as "updates" or "fix stuff."
- When implementation agents are used, assign clear file/task ownership within the current milestone and avoid simultaneous edits to the same files. Each agent reports its changes and verification evidence. One designated integration agent reviews the combined diff, runs integration gates, and creates commits; worker agents do not independently stage or commit shared-workspace changes.
- Never amend existing user commits, rewrite shared history, or force-push without explicit authorization. Do not discard unrelated working-tree changes to make the tree appear clean. Report remaining pre-existing changes separately from implementation work.

## 4. Milestones and exit gates

### M0 — Reproducible baseline and test infrastructure

Implement:

- Verify the local stack, applied migrations, selected dataset, and existing tests. Do not reset the current populated local database merely to obtain a clean baseline.
- Provide repeatable scripts for database assertions, database concurrency tests, and full browser tests. Keep `test:auth` usable as a focused auth command when broadening Playwright beyond `tests/auth`.
- Centralize local test account/fixture setup with unique run IDs and cleanup in `finally`/teardown. Fail fast if a test target is not an explicitly approved local/disposable resource; never fall back to hosted credentials.
- Add a production E2E mode that builds and starts Next.js with the **same local public variables at build and runtime**, overriding hosted `.env.local` values. Public variables can be embedded at build time; runtime overrides alone are insufficient.
- Add CI for static checks and deterministic fixture-backed application/database tests. Because `data/` is ignored and existing Python tests require the complete dataset, document a separate full-data gate. Use small synthetic fixtures for ordinary CI, clearly labelled as synthetic; keep complete-dataset validation as a real required check when touching importer/data logic and for final local acceptance.

Exit gate:

- Lint/typecheck and existing local auth, SQL, and Python checks pass with their prerequisites satisfied.
- `npm run build` passes in a capable environment. If the worker-port failure repeats, record it as environment-blocked and resolve the runner before claiming M0 passed; do not remove CSS or change framework versions just to conceal it.
- Scripts fail on assertion failure, missing required services/data, or required-test skips. A SQL command succeeding is not sufficient: the runner must fail on pgTAP `not ok`, plan mismatch, or incomplete execution.
- Production E2E mode cannot connect to the hosted project. Setup instructions reproduce the same target configuration.

### M1 — Database authorization and transaction guarantees

Implement meaningful tests before relying on these guarantees in new UI flows:

- Two real authenticated users and an anonymous client: shared-table/view reads allowed only as specified; ordinary writes to shared data denied; each private table readable only by its owner.
- Roster rename and watchlist insert/update/delete: another user's IDs cannot read or change their records. Ownership-column changes, crafted foreign roster references, and direct membership/lineup writes cannot bypass grants/RLS/constraints. Exercise both permitted and forbidden operations.
- Unauthenticated RPC calls denied; unknown player IDs rejected without partial changes; repeated roster initialization remains unique, including simultaneous calls.
- Names: trimmed 1–80 characters. Notes: at most 2,000 characters. Verify boundary values and rejected persisted writes, not only disabled form buttons.
- Lineups: null/invalid input, fewer/more than five starters, duplicates, nonmembers, both date boundaries, out-of-range dates, and an in-range date without games. Invalid replacement leaves the complete previous snapshot unchanged, not merely its row count.
- Account cleanup/cascade removes private rows and preserves shared NBA data.

Concurrency tests must use independent database connections/transactions or authenticated clients. A single transaction or sequential browser action dispatcher cannot prove concurrent safety. Use explicit synchronization, bounded lock timeouts, and cleanup; avoid arbitrary sleeps as the synchronization mechanism.

Required race scenarios:

| Scenario | Assertions |
| --- | --- |
| Nine members; two distinct additions overlap | Exactly one addition succeeds; count remains ten; rejected addition leaves no extra membership |
| Duplicate simultaneous additions | One membership persists; the other attempt is rejected consistently |
| Two lineup replacements for the same date | Persisted result is one complete ordered starter/bench snapshot, never mixed or partial entries |
| Save versus member removal/addition | Result matches a valid serial order under the parent-roster lock; historical entries may retain a subsequently removed player; a new save cannot select an already removed player |
| Simultaneous roster initialization | One roster UUID per user, reused by all successful calls |

Exit gate: the expanded authorization/transaction suite passes, race tests demonstrate actual overlapping transactions, and the initial 18 assertions plus importer rollback checks remain green. Add a new migration only if tests reveal a real defect.

### M2 — Player directory and historical details

Implement:

- `/players` with bounded name search, stable pagination/order, empty results, and validated URL parameters. Directory membership and averages are restricted to the imported season.
- `/players/[id]` with season averages and paginated recent-first history. Display unknown positions honestly. Preserve game IDs as strings, zero-minute appearances, and per-game historical team/opponent relationships.
- Typed server query helpers in `lib/`; avoid one request per visible player. Treat missing import metadata as a clear setup/empty state rather than inventing dates or zero statistics.

Tests and exit gate:

- Search, pagination, invalid/nonexistent IDs, protected access, empty/error states, and links work in Playwright.
- Database/query integration checks verify appearance-based averages against fixture calculations, including a zero-minute appearance, unknown position, and a player with games for two different teams. Round only for display.
- Rendering escapes search/player content. Query bounds and stable pagination are exercised; no unbounded full-history downloads.
- Lint/typecheck/build and relevant M1 regression checks pass.

### M3 — Roster management and watchlist

Implement:

- Add/remove roster controls on appropriate player/dashboard surfaces; roster count out of ten and rename control. Handle pending, duplicate, full-roster, and database failure states visibly.
- `/watchlist` with bounded listing, add/remove, notes editing, and add-to-roster. Adding to the roster leaves the watchlist entry and its notes intact.
- Revalidate affected pages so counts, membership indicators, and notes agree after mutations and reload. Treat double submissions safely; the database remains authoritative.

Tests and exit gate:

- Browser flow: create user → search → add player → rename → reload → remove. Fill ten places, reject the eleventh, reject duplicate addition, and verify persisted count.
- Watchlist notes survive navigation, reload, and sign-out/in; duplicate entries are prevented; removal persists; add-to-roster preserves watchlist data. Test 2,000-character acceptance and 2,001-character rejection.
- Two browser contexts cannot see each other's roster/watchlist state, including after account switching. Server mutation tests reject unauthenticated/crafted requests even when bypassing UI validation.
- Existing auth and M1 security/concurrency tests pass; removed membership does not delete an existing saved lineup.

### M4 — Historical lineup editor and dashboard

Implement:

- Select date using imported metadata bounds, preserving `YYYY-MM-DD` as a date-only value without timezone shifts. Default to a valid historical date from metadata, not today's date outside the season.
- Show saved starters/bench and clearly label unsaved selections. Unsaved dates put the current roster on the bench. Allow five ordered unrestricted starters; games and positions do not determine eligibility.
- Save through `save_lineup`, restore an existing date, and replace it atomically. When editing history, use current membership, show removed historical players appropriately, and require replacements before saving.
- Display roster name/count, selected date, historical games, season, and last successful import time. Derive teams only from historical records. If a player has no appearance on that date, do not infer a team from a current roster or fabricate participation; show that limitation clearly.
- Handle fewer than five roster members, no games, missing metadata, pending changes, mutation errors, and date navigation without presenting unsaved edits as persisted. Define a simple, tested behavior for leaving dirty selections.

Tests and exit gate:

- Browser flow: roster of six or more → choose date → choose five starters → save → reload/sign-out/in → restore ordered starters and all remaining bench players → replace lineup.
- Test season boundary dates, date with no games, duplicate/insufficient starters, and out-of-season/crafted server input. Failed save preserves the prior exact snapshot and reports the error.
- Remove a saved starter; historical view still contains the snapshot; edit cannot resave that removed player; choose replacement and save using current roster. Added roster members appear on bench on the next save.
- Date-only behavior is checked under at least two timezones. Fixture coverage proves historical team display for a traded player and avoids invented availability.
- M1 races, all auth/product browser flows, lint/typecheck/build pass.

### M5 — MVP acceptance, usability, and handoff

Implement/verify:

- Complete an acceptance checklist mapped to every bullet in `IMPLEMENTATION.md`, with test names or manual evidence. Distinguish local MVP completion from release completion.
- Exercise desktop and narrow mobile widths, keyboard navigation, labelled controls, focus/error visibility, loading, empty, and retry states. Inspect actual rendered pages; automated happy-path assertions alone are insufficient.
- Run the full browser suite against the production server, including user switching and private-data isolation. Run confirmation-disabled and confirmation-enabled local auth separately; capture signup confirmation and recovery from the local mail viewer, test PKCE in the requesting browser, and retain token-hash coverage.
- Review the diff for leaked credentials, application service-role usage, broad cache sharing, unrelated changes, direct invariant-bypassing writes, and swallowed database errors. Inspect current dependency audit findings and document actionable exceptions with evidence; do not treat old README audit counts as current facts or do blind dependency upgrades.
- Update README with commands, local mail testing, migration/test setup, fixture/full-dataset distinction, auth-setting differences, known limitations, and reproducible production E2E instructions.

Exit gate: every local MVP acceptance item has evidence; no unresolved functional, authorization, concurrency, or integrity defect; production build and production browser suite pass; required tests are not skipped. Any external release item remains explicitly pending.

### M6 — Release preparation and separately authorized deployment

Prepare a concrete release checklist after M5. Continue independent preparation if external access is unavailable; do not relabel preparation as deployment.

- Resolve the existing source-use publication concern recorded in `docs/data-feasibility.md` before publishing NBA data. This is an existing specification gate; local implementation can continue. Do not claim current legal suitability based on the historical review.
- With appropriate authorization, verify hosted migration state, apply pending versioned changes, import the existing validated dataset transactionally, and compare counts/date bounds/representative statistics. Never run destructive reset against the linked hosted project.
- Configure canonical HTTPS `APP_URL`, public Supabase settings, exact auth redirect allowlists, and email templates. Keep database/import credentials out of Vercel application configuration.
- Record intended confirmation mode; verify email delivery and callbacks with bounded hosted smoke tests after email capacity/configuration is ready. Local generated links do not satisfy this gate.
- Deploy frontend/backend together to Vercel within the user's authorized scope. Verify signup, sign-in/out, recovery, private-data isolation, roster/watchlist persistence, lineup restoration, and dataset metadata at the deployed origin.
- Document recovery: previous known-good deployment, backward-compatible migration handling, and importer rollback guarantees. A frontend rollback does not undo database migrations.

Exit gate: deployment URL, deployed commit/version, hosted checks, auth configuration, data evidence, and any accepted limitations are recorded. Do not claim the full specification complete while deployment or hosted auth remains unverified.

## 5. Quality-gate execution policy

| Change type | Minimum gate before marking milestone complete |
| --- | --- |
| Any app change | Lint, typecheck, production build, affected behavior tests |
| Auth/session/proxy/cache | Full auth suite, account-switch/private-data tests, affected production E2E |
| Database/RPC/RLS | Migration on disposable database, pgTAP authorization/invariant suite, independent-transaction races, affected browser flows |
| Import/data/query semantics | Relevant Python tests, complete-dataset validation when applicable, transaction rollback/repeat checks, query/stat fixture checks |
| Roster/watchlist | Mutation authorization, persistence/capacity/notes browser flows, auth regression |
| Lineup/dashboard | Exact snapshot preservation, history/current-membership flow, dates/timezones, races, full product E2E |
| Final local acceptance | All local gates, production E2E, both local confirmation modes, visual/keyboard review |

Existing runnable commands (local stack and dataset required):

```sh
npm run lint
npm run typecheck
npm run build
npm run test:auth
.venv/bin/python -m unittest discover -s tests -v
SUPABASE_TEST_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  .venv/bin/python -m unittest discover -s tests -v
```

The URL above is the standard local database only. Confirm it is the intended test resource. M0 must add/document runners for `supabase/tests/roster_planner.sql`, concurrency, fixture tests, and production E2E; those commands do not exist yet. Do not describe planned runners as already available.

Rules for failures:

- A failed required assertion blocks that milestone. Diagnose and fix it; do not weaken assertions, add blanket skips, or substitute mocks for RLS/transaction evidence.
- Retries are diagnostic. A flaky test that passes only after retry is not a clean gate; remove shared-state/timing causes. Bound race tests so failures do not hang the runner.
- Missing Docker/Supabase/browser/data/build capability is an environment blocker, not an application pass. Record the exact check and prerequisite; continue only independent work, and keep dependent completion pending.
- Use unit tests for nontrivial validation/date/snapshot logic, integration tests for database behavior, and browser tests for user workflows. Avoid snapshotting entire components or testing trivial helpers solely to raise coverage.
- CI and local reports must identify fixture-backed versus full-data runs. No arbitrary line-coverage target substitutes for the invariant and workflow checks above.

Suggested milestone report:

```text
Milestone:
Behavior delivered:
Files/migrations changed:
Verification: command, test/assertion count, result
Skipped/blocked checks and reason:
Known defects or limitations:
Next milestone:
```

## 6. Prompt to give the implementing Codex agent

```text
Implement the remaining Fantasy Basketball Roster Planner MVP in this repository.
Read AGENTS.md, IMPLEMENTATION.md, and DEVELOPMENT_PLAN.md first. Follow the
installed Next.js documentation before writing framework code. Preserve existing
modified/untracked work and all secrets. Reuse data/CURRENT; do not recollect NBA data.

Start with M0 and proceed through M5 in order, implementing tests alongside each
feature and enforcing each milestone's exit gate. Preserve existing auth, importer,
session-bound Supabase clients, RLS, and locking RPCs. Treat the production build as
unverified until you reproduce a pass; the previous review hit a worker-port restriction.

Email confirmation is temporarily disabled because of hosted email limits. Keep
routine tests entirely on local disposable Supabase. Preserve both signup behaviors,
test enabled confirmation separately using local mail, and do not change hosted Auth
settings or introduce paid services. Do not bypass authentication or database invariants.

Implement bounded player browsing/details, roster management, watchlist notes,
historical lineup editing, and the responsive dashboard exactly as specified.
At each milestone report delivered behavior, changed files, test evidence, and any
blocked checks. Continue autonomously through passing gates. Do not claim skipped,
flaky, or environment-blocked checks passed. Update the acceptance checklist and README.

Prepare M6's concrete release checklist after local acceptance. Hosted mutations,
publication/deployment, paid services, and source/scope changes require authorization
beyond this local implementation request. Keep release completion separate from local
MVP completion and preserve the documented source-use publication gate.
```


## 7. Delivered local evidence (2026-10-12)

Local M0–M5 gates were implemented and verified in order. See [fresh milestone evidence](docs/mvp-progress.md), [specification acceptance and concrete M6 checklist](docs/mvp-acceptance.md), [independent security review](docs/security-review.md), and [actual rendered usability review](docs/usability-review.md). The earlier review results above remain historical evidence, not current gate substitutes. Final production verification uses the supported webpack compiler with CSS and framework versions retained; the Turbopack worker-port restriction is recorded. M6 is prepared only; hosted/source-use/publication/deployment gates remain pending.
