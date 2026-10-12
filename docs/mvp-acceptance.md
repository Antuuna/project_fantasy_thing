# Specification acceptance and release status

Local M0–M5 acceptance is complete. Final evidence: 26 production browser/API workflows, one separate real-mail confirmation/recovery workflow, 280 SQL assertions, eight proven transaction races, 18 unit tests, and 22 full-data Python tests pass; lint/typecheck and production builds pass. Required checks have zero skips/retries. Release completion remains separate.

| Specification acceptance item | Evidence / status |
| --- | --- |
| Registration, configured confirmation, sign-in, reset, sign-out | `tests/auth/auth.spec.ts` tests both existing auth workflows; `tests/confirmation/confirmation.spec.ts` passed actual local signup/recovery email links with PKCE; `tests/unit/auth-requests.test.ts` covers deterministic throttles/send failures. Normal confirmation-disabled config restored byte-for-byte, database counts unchanged. |
| One roster initializes once and can be renamed | Auth workflow, 190-assertion authorization suite, concurrent initialization, and roster browser flow. |
| Accurate search, season averages and player details | Player browser tests; 43 synthetic query assertions include zero-minute appearances/traded player/appearance denominator; query API checks; 29 literal search assertions. |
| Add/remove persistence, duplicate/capacity rejection | Roster browser flow fills ten and rejects eleven; SQL invariants; independent nine-plus-two and duplicate races. |
| Watchlist notes edit/delete; add-to-roster preserves entry | Notes browser flow accepts 2,000 and rejects 2,001 with exact row preservation, reloads and switches sessions; bounded watchlist pagination. |
| Five ordered starters and full bench save/restore across sessions | Ordered lineup browser workflow checks rendered and persisted assignments before/after sign-out/in. |
| Atomic replacement and exact preservation after invalid saves | Crafted lineup POST test compares every stored column; SQL failures and overlapping replacement race. |
| Membership removal preserves history; editing requires current players | Lineup history workflow removes a saved starter, retains snapshot and label, excludes removed option, replaces and captures a new bench player. |
| Two-user private-data isolation and crafted ownership | Real authenticated two-user API security suite; SQL matrix; captured unauthenticated/crafted Server Actions; browser context/account switching. |
| Concurrent capacity and roster/lineup invariants | Eight actual independent transaction tests verify blocked backends through `pg_blocking_pids`, then exact serial outcomes. |
| Failed/repeated imports preserve usable dataset | Full-data integrity and importer tests use existing `data/CURRENT`; repeat publication plus late FK failure rolls back all data/metadata. |
| Responsive loading/empty/validation/error states | Player query-state tests include targeted missing metadata (including dashboard) and actual failure/retry; two usability tests and inspection of seven final desktop/mobile screenshots passed. See `docs/usability-review.md`. |
| Type checking, lint, production build, security/integrity checks | Final lint/typecheck and fresh webpack builds pass; 26 production workflows, 280 SQL assertions, 8 races, 18 units, 22 full-data tests and one separate real-mail workflow pass. Independent review has no unresolved application defect; five development dependency findings remain explicitly documented. |
| Frontend/backend deployed together with production redirects | **Pending M6, separately authorized.** No hosted writes, source publication, or Vercel deployment performed. |
| Reproducible setup/migrations/import/deployment documentation | Updated README, pinned manifests, local-only runners, synthetic CI workflow, release checklist below. |

Extra required semantics are covered by lineup date/no-game/dirty-state and Pacific/Tokyo tests, query fixtures preserving textual game IDs and unknown positions, and historical games that show unknown team/availability when no appearance exists. Rounding occurs only in display components.

Known limitations: imported positions are unknown; minutes have whole-minute precision; data is historical, without live scoring; dependency audit has five development-only lint-chain findings and zero production findings. See [security review](security-review.md) and [milestone evidence](mvp-progress.md).

## M6 concrete release checklist

1. **Resolve source-use publication first.** Review the existing concern in [data-feasibility.md](data-feasibility.md). Record authorization covering storage, historical display, fantasy roster/lineup use and intended deployment, or obtain an explicit approved source/scope change. Technical collection success and `nba_api`'s software license do not satisfy this gate.
2. **Obtain separate hosted/deployment authorization.** Identify the target Supabase project and Vercel project; record the reviewed release commit. No reset, history rewrite, paid upgrade or remote push is part of this local implementation.
3. **Inspect hosted state read-only before mutation.** Compare applied migration versions and table/policy/function definitions with the three local versioned migrations. Back up/recover according to the host's supported process; apply only missing migrations. Never run a hosted reset.
4. **Import the existing selected dataset transactionally.** Use importer-only PostgreSQL credentials outside application configuration. Validate `data/CURRENT`, compare 30 teams / 582 players / 1,230 games / 26,651 appearances, season bounds 2025-10-21–2026-04-12, textual IDs, historical trades and representative averages. Verify repeat import and retain last-good metadata; do not recollect data.
5. **Configure application and email origins.** Set canonical HTTPS `APP_URL`, public Supabase URL/key, exact `/auth/callback` and recovery redirect allowlists, and reviewed PKCE/token-hash email templates. Keep service-role/database credentials out of Vercel application variables and browser bundles.
6. **Record production confirmation policy explicitly.** The release default is to restore confirmation after email capacity/configuration is ready. Retaining disabled confirmation requires an explicit user decision. Perform bounded signup/confirmation/recovery smoke tests with real hosted mail and callbacks; local inbox/generated links do not establish hosted delivery. No paid mail service is authorized.
7. **Deploy frontend and server together to Vercel.** Build the reviewed commit with installed pinned dependencies and supported webpack compiler; record URL, commit/build ID and configuration. Verify signup/sign-in/out/recovery, two-user isolation, roster/watchlist persistence, ordered lineup restoration, missing/invalid states, and visible dataset metadata at the deployed origin.
8. **Record recovery and handoff evidence.** Identify prior known-good deployment and rollback procedure. A frontend rollback does not undo database migrations; use backward-compatible migration planning and transactional importer failure preservation. Record all hosted results and accepted limitations before declaring release complete.

M6 is prepared, not executed. Hosted state, email delivery and deployment remain unverified.
