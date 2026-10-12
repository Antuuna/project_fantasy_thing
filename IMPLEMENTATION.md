# Fantasy Basketball Roster Planner — Implementation Specification

> Scope amendment (2026-10-11): The user resumed the fantasy roster application using the existing NBA dataset. The fantasy requirements below are active again. Reuse the completed local collection; do not repeat data feasibility or acquisition. The earlier private ML scope is superseded.

For the remaining implementation sequence, per-milestone tests, quality gates, temporary email-confirmation policy, and a ready-to-use agent prompt, see [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md). This specification remains the product requirements reference; the development plan records fresh verification separately from earlier checkpoints.

## Current implementation checkpoint

Data acquisition and technical feasibility are complete for the local dataset. Reuse the version selected by `data/CURRENT`; do not repeat the feasibility probe or full collection as a prerequisite to further work.

- Validated version: `data/versions/20261012T040025215418Z`.
- Coverage: 2025–26 regular season, 2025-10-21 through 2026-04-12.
- Contents: 30 teams, 582 players, 1,230 games, and 26,651 player appearances.
- Verification: all six dataset integrity tests pass, including CSV hashes, counts, historical relationships, duplicate/missing-data rejection, and failed-refresh preservation.
- Limitations: positions are unknown; minutes have whole-minute precision. Preserve text game IDs and historical team relationships.

Local milestones M0–M5 are complete. The original importer/schema/locking RPCs are preserved; two additional versioned migrations provide authenticated invoker player/history views and literal bounded name search. The application now implements authentication, player directory/details, roster rename/add/remove, watchlist notes, saved historical snapshots/current-roster editing, and responsive dashboard states. Fresh final gates pass: 26 production browser/API workflows, one separate real-mail confirmation/recovery PKCE workflow, 280 SQL assertions, eight actual overlapping transaction races, 18 unit tests, and 22 full-data Python tests, with no required skips/retries. Lint/typecheck and supported webpack production builds pass. The documented Turbopack worker-port restriction remains environment-specific. Local email confirmation was restored to its original disabled mode after the enabled test, with configuration bytes and database counts preserved. See [milestone evidence](docs/mvp-progress.md), [acceptance map and M6 checklist](docs/mvp-acceptance.md), and independent security/usability reviews. Hosted migration/import, production authentication/email and Vercel deployment remain unverified; the documented NBA source-use publication gate remains unresolved.

## Purpose and status

Build a small internship learning project using Next.js, TypeScript, Tailwind, Supabase, and Vercel. Users assemble a personal NBA roster, maintain a watchlist, inspect historical performance, and save daily lineups.

This document remains the product requirements reference. Local MVP acceptance is verified; release completion requires separately authorized hosted verification and deployment after resolving the documented source-use publication concern. Technical defaults can adapt to supported installed libraries without expanding product scope. The linked hosted project's state has not been inspected or changed during local implementation.

## Required stack and architecture

- Next.js with TypeScript and Tailwind for the application.
- Deploy the frontend and Next.js application backend together on Vercel.
- Supabase PostgreSQL for persistence and Supabase Auth for authentication.
- Use the Python `nba_api` package to collect NBA data, normalize it, and import it into Supabase.
- Run the collection/import script locally initially. It is a data preparation tool, not an additional deployed backend.
- Application requests read imported NBA data from Supabase. They do not require a live NBA API request.

Recommended defaults: Next.js App Router, server-rendered reads where useful, and server actions or route handlers for mutations. Use the supported Supabase SSR authentication integration. Maintain session-aware database access so RLS applies to application requests.

```text
NBA.com → nba_api → local Python collector/importer → Supabase
                                                       ↕
                                  Next.js frontend/backend on Vercel
```

## MVP scope

- Historical 2025–26 NBA regular season; exclude playoffs.
- Email/password registration, sign-in, password reset, and sign-out.
- One roster per user, up to ten distinct players.
- Five unrestricted starting slots; no position eligibility rules.
- Player directory, season averages, and game history.
- Personal watchlist with editable notes.
- Saved lineups for dates within the imported season.
- Responsive dashboard and pages with loading, empty, and error states.
- Repeatable manual imports and visible dataset metadata.

Do not add live scoring, automated refreshes, leagues, drafts, trades, payments, multiple rosters, or fantasy points to the MVP.

## Screens and behavior

### Authentication

Provide sign-up, sign-in, password-reset request, and password-update flows. Respect the configured Supabase email-confirmation behavior and explain the next step after registration. Protected pages require a valid session. Configure local and deployed authentication callback URLs. Signing out returns the user to sign-in.

Create a user's roster on first authenticated use with a reasonable default name, such as `My Roster`. Initialization must be safe to repeat and cannot create duplicate rosters.

### Dashboard

Show roster name, player count out of ten, selected historical date, starters, bench, and relevant games for roster players on that date. Show the dataset season and last successful import time. A team appearing in a selected-date game must come from historical game/stat relationships, not an assumed current player team.

Users can rename their roster, remove players, choose a date, select starters, save a lineup, and edit an existing lineup. Provide a clear path to player search when the roster is empty.

### Players

Search players who appeared in the imported season by name. Display available position information, season averages, and game history with recent games first. Show the team associated with each historical game.

Support adding players to the roster and watchlist. Prevent duplicates. Reject roster additions when capacity is reached, with an understandable message. Use pagination or bounded results for large listings.

### Watchlist

Show saved players and personal notes. Support editing notes, removing entries, and adding a player to the roster. Adding a watched player to the roster leaves the watchlist entry intact.

## Lineup rules

- A lineup belongs to one roster and one historical date.
- Saving requires exactly five distinct starters, all belonging to the user's current roster at save time.
- Slots are `starter_1` through `starter_5`, plus `bench`.
- Every remaining current roster player is saved as bench when saving a lineup. Saving captures the full roster assignment for that date.
- A player does not need to have a game on the selected date to be selected.
- A date must be within the imported season's inclusive date range. Dates without games remain valid.
- No duplicate player or starting slot is allowed in a daily lineup.
- Saving an existing date replaces that date's entries atomically.
- Roster changes do not change or delete previously saved lineups.
- Editing an old lineup uses the current roster: exclude removed players from the editable selection and require the user to choose valid replacements before saving.
- An unsaved date starts with the current roster on the bench. Clearly distinguish an unsaved selection from a saved lineup.

## Database specification

Use NBA-provided IDs for shared records and generated UUIDs for user-created records. Preserve game IDs as text so leading zeroes are not lost. Use PostgreSQL `date` for game/lineup dates and `timestamptz` for audit timestamps. References to `user_id` point to `auth.users.id`. A separate public users/profiles table is unnecessary for this MVP.

### Shared NBA tables

| Table | Required fields and constraints |
| --- | --- |
| `nba_teams` | `id` primary key, `name`, `abbreviation` |
| `nba_players` | `id` primary key, `full_name`, nullable `position` |
| `nba_games` | `id` text primary key, `season` text such as `2025-26`, `game_date`, `home_team_id` and `away_team_id` foreign keys; teams must differ |
| `nba_player_game_stats` | `player_id`, `game_id`, `team_id` foreign keys; primary key `(player_id, game_id)`; `minutes`, `points`, `rebounds`, `assists`, `steals`, `blocks`, `turnovers` |

Store minutes as a consistently normalized numeric value. Counting statistics must be nonnegative. Do not silently replace unavailable data with zero. A player can change teams during a season; team membership for historical performance belongs on the statistics record. Missing position information must not prevent importing or displaying a player.

### User-owned tables

| Table | Required fields and constraints |
| --- | --- |
| `rosters` | `id` UUID primary key, `user_id` unique, `name`, `created_at`, `updated_at` |
| `roster_members` | `id` UUID primary key, `user_id`, `roster_id`, `player_id`, `created_at`; unique `(roster_id, player_id)` |
| `watchlist_entries` | `id` UUID primary key, `user_id`, `player_id`, `notes`, `created_at`, `updated_at`; unique `(user_id, player_id)` |
| `lineup_entries` | `id` UUID primary key, `user_id`, `roster_id`, `player_id`, `lineup_date`, `slot`, `created_at`, `updated_at`; unique `(roster_id, lineup_date, player_id)` |

Lineup entries reference `nba_players` and `rosters` directly. **Do not create a foreign key from a lineup entry to a roster member**: deleting a membership must preserve historical lineups.

Enforce matching ownership for roster children using a composite foreign key `(roster_id, user_id)` referencing a unique `(id, user_id)` on `rosters`, or an equally strong database constraint. Use a partial unique index on `(roster_id, lineup_date, slot)` for starting slots only; multiple bench entries are permitted. Validate allowed slot values.

Recommended input limits: roster names 1–80 trimmed characters; watchlist notes at most 2,000 characters. Enforce these on the server and in the database where practical.

Deleting roster memberships must leave lineup entries intact. Deleting an account should cascade its private data. Shared data should not be deleted casually during imports; preserve references from user records.

### Derived data and import metadata

Expose season averages through a query or view joining statistics to games and grouping by player and season. Average over recorded player appearances, not every team game. Verify extraction semantics for non-playing entries and exclude them consistently. Round for display, not storage.

Use a small metadata table, such as `nba_dataset_imports`, to record successful imports: season, completion timestamp, source, row counts, and season date bounds. This is operational metadata in addition to the eight domain tables. Display metadata from the last successful import only.

## RLS, indexes, and database mutations

Enable RLS on every exposed application table, including import metadata. Explicitly define grants and policies.

- Shared NBA data and successful import metadata: authenticated read access; no ordinary user writes.
- User tables: select/delete policies require `auth.uid() = user_id`; insert requires the same through `WITH CHECK`; update requires both ownership of the existing row and ownership of the new row.
- Child rows cannot reference another user's roster. Enforce this independently of UI validation.
- The app must use the signed-in user's database context. Never use the import/service-role credential to handle ordinary application requests.
- Keep privileged database credentials in the local importer environment only and never in public client variables, commits, or logs.

Required query-supporting indexes:

- `user_id` on all private tables unless already covered as the leading column of a suitable index.
- `nba_games.game_date`.
- `(user_id, lineup_date)` on lineup entries.
- `(user_id, created_at)` on watchlist entries.
- `game_id` on player statistics; the primary key already supports queries beginning with `player_id`.
- Add foreign-key/query indexes where actual query patterns require them; avoid redundant indexes.

Enforce capacity and lineup invariants in the database, not solely in the interface. Recommended approach: authenticated transaction-backed database functions for roster addition and lineup saving. Lock the parent roster while validating and writing, ensuring concurrent operations cannot exceed ten members or save inconsistent lineups. Derive the user from the authenticated session; do not trust a client-supplied owner ID. If using privileged functions, explicitly check authorization, fix the search path, limit execution grants, and prevent direct writes that bypass invariants. A trigger-based approach is also acceptable if it provides equivalent guarantees.

## Data feasibility and import workflow

The extraction, normalization, local publication, and full-season validation steps below are already complete. Reuse the existing CSVs; the remaining application work is transactional Supabase import and verification. The list is retained as the original workflow reference:

1. Review NBA.com data usage terms for the intended fantasy application and deployment. The `nba_api` code license does not grant rights to the underlying NBA data. If unsuitable, surface the blocker and propose another source rather than assuming permission.
2. Test a small extraction: teams, a few players, games, and player game statistics. Verify actual endpoint fields, date formats, ID formats, minutes, and non-playing entries.
3. Confirm that the required historical data is obtainable. Handle timeouts and transient failures with bounded retries and conservative request pacing.
4. Save raw sample responses locally for debugging; normalize into the target schema with validation and clear error reporting.
5. Build a repeatable importer using stable IDs and upserts. Load parents before children.
6. Stage or transactionally publish validated imports so a failed refresh does not leave the displayed dataset partially updated. Keep the previous successful data and metadata usable.
7. Import the full chosen regular season and verify row counts, foreign keys, duplicate handling, date bounds, and representative statistics.

Static package player/team lists may help resolve identities, but inclusion in the directory must be based on appearances in the imported season. Do not treat a static active-player list as historical roster membership.

## Implementation organization and configuration

Recommended repository organization:

```text
app/                   Pages, layouts, auth callbacks, server handlers
components/            Reusable interface components
lib/                   Supabase clients, validation, queries, domain types
supabase/migrations/   Versioned schema, policies, indexes, functions/views
scripts/nba/           Python collector, normalization, importer
tests/                 Meaningful integrity, security, and workflow checks
README.md              Setup and operational instructions
```

Provide an environment template with names and placeholders only. Document the Supabase URL and publishable client key required by the app, app URL/callback configuration, and separately the privileged importer credentials. Use the variable names supported by the chosen Supabase integration. Pin dependencies and include lockfiles. Keep generated datasets and secrets out of version control unless deliberately approved.

## Acceptance and verification

The MVP is complete when:

- A new user can register, complete configured confirmation, sign in, reset their password, and sign out.
- A roster initializes once and its name can be edited.
- Search and player details show the imported season's data accurately.
- Add/remove operations persist; duplicate additions and capacity overflow are rejected.
- Watchlist notes can be edited; entries can be deleted; roster addition preserves the entry.
- Five valid starters and remaining bench players can be saved for a valid date and restored after signing in again.
- Replacing a lineup is atomic; invalid saves preserve the previously saved lineup.
- Removing a roster member preserves saved history; editing history enforces current membership.
- Two users cannot read or mutate each other's private data, including through direct database requests or crafted child references.
- Concurrent additions cannot exceed roster capacity; concurrent roster/lineup changes maintain invariants.
- Failed or repeated imports do not duplicate records or destroy the last usable dataset.
- Mobile layout and loading, empty, validation, and failure states are understandable.
- Type checking, linting, production build, and relevant security/integrity tests pass.
- The frontend and application backend are deployed together on Vercel, with production authentication redirects verified.
- The README allows another developer to reproduce setup, database migrations, collection/import, and deployment.

Prioritize tests for RLS, ownership, concurrency, transactional saves, import normalization, and core user workflows. Do not add tests that only mirror trivial implementation details.

## Delivery sequence for agents

1. Inspect repository instructions and existing code; report the starting state.
2. Reuse the validated dataset selected by `data/CURRENT`; technical data feasibility is complete. Preserve the documented source-use concern for deployment review.
3. Implement versioned database schema, indexes, ownership policies, and transactional mutations; verify with two users.
4. Implement and run the CSV-to-Supabase importer using the existing validated dataset; verify atomic publication and repeated imports without recollecting NBA data.
5. Build authentication, protected navigation, and basic responsive layouts.
6. Build player browsing, roster management, and watchlist operations.
7. Build historical lineup management and dashboard views.
8. Verify acceptance criteria, document setup, and prepare/deploy on Vercel within the user's authorized scope.

At each milestone, report what works, how it was verified, and material blockers. Never claim extraction, security verification, or deployment succeeded without evidence. Resolve ordinary implementation details autonomously; ask about changes that affect agreed scope, cost, data-source suitability, or required external account access.

## Reference documentation

- nba_api: https://github.com/swar/nba_api
- Supabase data import: https://supabase.com/docs/guides/database/import-data

Consult current official documentation for framework, authentication, database, and hosting implementation details. These references do not imply that data access or deployment has already been validated.
