# Independent MVP security and acceptance review

Reviewed 2026-10-12, from baseline commit `7d1ca23` through the M4 implementation
and the M5 auth-request boundary. This review covers code and recorded local test
evidence, not hosted deployment or a guarantee that every vulnerability is absent.
Environment files were excluded from all reads and credential scans.

## Findings and disposition

No unresolved application authorization, private-cache, roster-capacity, atomic
lineup-replacement, or historical-snapshot defect was found in the reviewed code.
The two test-target findings below were corrected by the coordinator and re-reviewed
in source; the subsequent complete-dataset gate passed all 22 checks. The final
combined browser run remains a separately recorded acceptance gate.

| Severity | Location | Finding / disposition |
| --- | --- | --- |
| Medium, test infrastructure | `tests/test_import_dataset.py:70` | The inherited integration test originally connected directly to `SUPABASE_TEST_DB_URL`. The required full-data runner overwrites this with loopback, but direct unittest invocation did not itself reject hosted targets. Resolved: the test now validates its URL before connecting and pins loopback hostaddr. The subsequent required full-data gate passed all 22 checks. |
| Low, test infrastructure | `scripts/testing/seed_synthetic.py:106`, `tests/fixtures/check_seed_rollback.py:20` | A validated loopback URI alone leaves libpq's separate `hostaddr` option unspecified; `PGHOSTADDR` can influence the actual destination. Resolved: both connections now explicitly pin `hostaddr=127.0.0.1`, matching the central local connector. |
| High advisory, dev dependency exception | `package-lock.json:2853` | `braces` stack-exhaustion advisory, transitive through the Next ESLint toolchain. See the bounded local-development exception below. No production dependency advisory was reported by the recorded production audit. |

Previously resolved review findings: PostgREST's `*` wildcard alias was eliminated
from player search using the literal-search RPC; uncontrolled selected-date input
now resets by date; stale lineup success feedback is hidden when edits are dirty;
notes and starter controls now have explicit labels; automatic native form reset
after a lineup Server Action is prevented so all five selects retain their saved
values immediately after saving. These are incorporated fixes,
not outstanding findings.

## Security boundaries inspected

- `lib/auth/session.ts` verifies claims using the session-bound Supabase client.
  Each private query and server mutation calls it independently of the protected
  layout. `lib/supabase/server.ts` uses the public client credential and request
  cookies. No application service-role or privileged importer connection appears
  in `app/`, `components/`, or `lib/`.
- `app/planner/actions.ts:8` derives ownership from verified claims. Submitted
  `user_id`/`roster_id` values are not authoritative. Rename/notes/delete also
  filter by authenticated owner; RLS applies independently. Duplicate FormData
  fields, invalid IDs, trimmed names and codepoint-based notes limits are checked.
  Raw provider/database errors are not returned to users.
- `app/lineups/actions.ts:9` authenticates before validation; checks canonical
  date bounds, five distinct player IDs and current membership; then invokes the
  database RPC. The preflight is a helpful error boundary, not a substitute for
  the RPC's transaction-time membership checks.
- `supabase/migrations/20261012042000_roster_planner.sql:161` validates the complete
  replacement before deleting the prior snapshot and locks the parent roster.
  Add/remove/save share this lock. Membership and lineup direct writes are denied;
  ownership composite foreign keys and slot/uniqueness constraints remain intact.
  Saved entries reference NBA players directly, so membership deletion preserves
  history. Privileged RPCs fix their search paths and restrict execution grants.
- `lib/players/queries.ts`, `lib/planner/queries.ts`, and `lib/lineups/queries.ts`
  authenticate and perform bounded reads with deterministic tie-breaking. Directory
  and history use latest import season; averages count recorded appearances.
  The invoker views and literal-search RPC retain underlying grants/RLS.
  Historical team/opponent data comes from recorded game/stat relationships.
- The protected layout is dynamic. Private reads have no `use cache`, global result
  cache, or shared-cache wrapper. Session-refresh responses carrying cookies are
  marked private/no-store. Mutations revalidate the affected page trees; account
  switching is covered by two-context and same-context browser checks.
- Callback destinations are allowlisted. PKCE and token-hash callbacks validate
  through Supabase and show recoverable invalid-link errors. Password-reset
  success remains account-neutral. `lib/auth/requests.ts:18` makes one signup
  request, checks errors before sessions, and preserves both confirmation modes;
  recovery failure returns no success. Controlled tests cover mail/request
  throttling without exhausting an actual provider.
- `scripts/testing/confirmation-mode.mjs` verifies the approved local API,
  database and mail targets before changing configuration, requires port 3101
  to be free and holds an exclusive confirmation-run lock. The coordinator runs
  it separately from other local suites. It preserves volumes with stop/start,
  restores original config bytes in `finally`, verifies disabled normal auth and
  all shared/private/account counts, and retains its recovery backup on restoration
  failure. Subprocess credential buffers are withheld. Actual email tests follow
  allowlisted local links in the requesting browser, count PKCE callbacks without
  logging tokens, and clean only recipient-specific email IDs and their unique
  account. No hosted Auth setting is changed.
- The lineup form cancels React's automatic native reset after action completion.
  React state remains authoritative for all five controls; successful refreshed
  saved props clear the dirty baseline, while date/membership keys still reset
  the editor. The affected eight production lineup/usability workflows passed,
  including immediate selected-value checks after saving.
- `scripts/nba/import_dataset.py` verifies CSV hashes, identities, historical
  relationships, counts and bounds; publishes under advisory/table locks in one
  transaction; verifies copied values before successful metadata publication.
  Repeated upserts preserve references. Repeat-import and injected-failure tests
  compare prior data and import metadata after rollback.

Credential-pattern scans of tracked and nonignored untracked text files, excluding
all environment files, found zero literal JWT credentials, Supabase secret keys, or
private-key blocks. Scope review found no application paid-service, deployment,
collection, framework-version upgrade, or unrelated refactor. The recorded starting
inventory distinguishes existing user edits and reviewed scaffold integration from
new MVP commits; it is not evidence that the entire starting tree was clean.

## Acceptance mapping

This maps every specification acceptance bullet to concrete implementation and
evidence. M4 evidence is recorded in `docs/mvp-progress.md`: 24 production browser/API
workflows, 280 SQL assertions, eight overlapping-transaction scenarios, ten domain
unit tests, lint/typecheck and a fresh production build all passed without retries
or skips. Subsequent M5 evidence supplied by the coordinator: 22 complete-dataset
checks, 280 SQL assertions, eight overlapping-transaction tests and 18 unit tests
passed. The controlled confirmation run passed real signup/recovery local mail,
same-browser PKCE, updated-password login, and byte/count/mode restoration. The
affected eight lineup/usability production workflows passed after the native-reset
fix. Final combined 26-workflow production execution passed without retries/skips. All seven regenerated desktop/mobile screenshots were opened by the usability reviewer and coordinator; `docs/usability-review.md` records the completed rendered inspection.

| Specification requirement | Evidence / remaining gate |
| --- | --- |
| Registration, configured confirmation, login, reset, logout | `tests/auth/auth.spec.ts`; `tests/unit/auth-requests.test.ts`; `tests/confirmation/confirmation.spec.ts` passed real local signup/recovery mail and same-browser PKCE plus password relogin under the controlled runner. Hosted delivery is pending. |
| One initialized roster; editable name | Auth registration/reload test; planner roster persistence/name-bounds test; simultaneous initialization race. |
| Accurate imported-season search/details | `tests/players/players.spec.ts`, `query-integration.spec.ts`, and rollback SQL query/literal-search fixtures. Unknown position, zero-minute appearances, traded-player teams and unrounded averages covered. |
| Persistent add/remove, duplicates and capacity | Planner capacity/removal browser workflow; authorization SQL; duplicate and nine-plus-two overlapping additions. |
| Editable/removable watchlist; adding preserves notes | Planner notes/session/roster-add browser workflow and watchlist pagination; persisted 2,000-character acceptance and 2,001-character rejection. |
| Five starters/full bench saved and restored after login | Ordered lineup/session-restoration browser workflow plus RPC SQL checks. |
| Atomic replacement; invalid save retains exact snapshot | Crafted lineup browser test compares all stored columns; SQL snapshot checks and concurrent replacement race. |
| Removed memberships preserve history; editing uses current roster | Lineup historical/current-membership browser workflow and save/removal race in both valid serial orders. |
| Two users isolated, including direct/crafted child writes | Real authenticated API security suite; SQL grants/RLS matrix; captured action POSTs; two browser contexts and account switching. |
| Concurrent roster/lineup invariants | Eight independent-connection tests prove lock overlap using `pg_blocking_pids`, not sequential dispatch or sleeps. |
| Repeat/failed imports preserve usable data | Required complete-dataset gate and importer repeat/rollback integration test. Synthetic CI does not replace this check. |
| Mobile/loading/empty/validation/failure usability | Two production usability workflows passed desktop/narrow layouts, keyboard focus/select changes, pending and retry/empty/failure states. Rendered inspection is recorded in `docs/usability-review.md`; all seven final regenerated PNGs were opened and inspected without clipping or overlap. |
| Types, lint, production build, security/integrity gates | Final full-data22/SQL280/races8/unit18 gates passed; final combined26-workflow production execution and fresh build/lint/typecheck passed. See coordinator final milestone evidence. |
| Frontend/backend together on Vercel; deployed redirects | Pending M6, requires separately authorized deployment and hosted verification. No deployed-origin claim. |
| Reproducible setup/import/deployment README | Local runners and fixture/full-data setup are documented; coordinator updates final handoff/release checklist. Hosted execution remains pending. |

## Development dependency exception

Coordinator audit snapshots dated 2026-10-12 report **five high development-chain
findings and zero production findings**. Affected chain: `eslint-config-next` →
`@next/eslint-plugin-next` → `fast-glob` → `micromatch` → `braces`. The underlying
[braces advisory GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
reports stack exhaustion from deeply nested patterns through version 3.0.3 and lists
no patched version at review time. This can terminate a vulnerable tooling process;
it should not be described as harmless or fixed.

The audit's suggested remedy is `eslint-config-next@14.2.35`, a major downgrade from
the pinned 16.4.0 toolchain. Do not apply that blindly: it does not establish
compatibility with this installed framework or resolve the advisory safely.
The local exception is limited to controlled lint/build tooling: request handlers do
not import this glob chain or pass user search input into it, and production-only
audit excludes the affected chain. Continue using locked dependencies and isolated
CI jobs. Track the upstream advisory and compatible lint-toolchain resolution,
rerun both audits before release, and test lint/typecheck/build after any deliberate
compatible remediation. This is an outstanding tooling advisory exception, not a
clean full dependency audit or authorization for dependency upgrades.

## External release limits

The previously recorded NBA data publication/source-use concern remains unresolved
in `docs/data-feasibility.md`. This review does not establish legal suitability or
permission to publish. Hosted schema/data import, production confirmation policy,
email delivery/redirect configuration, Vercel deployment, deployed smoke tests and
rollback evidence remain separate M6 requirements. Local temporary disabled
confirmation must not silently become an asserted production policy.
