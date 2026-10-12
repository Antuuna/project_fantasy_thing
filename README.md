# Fantasy Basketball Roster Planner

The active objective is the fantasy roster application in `IMPLEMENTATION.md`, using the existing local 2025–26 NBA regular-season dataset. Data acquisition is complete. The dataset was originally collected for private ML practice; that earlier project scope has been superseded.

See [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) for milestone requirements and [local verification evidence](docs/mvp-progress.md) for reproduced results. The application implements authentication, player browsing, roster management, watchlist notes, and historical daily lineups. Release status and acceptance evidence are recorded in [the acceptance checklist](docs/mvp-acceptance.md).

## Run the Next.js application

Use Node.js 22 or newer (Node.js 24 was used for the initial scaffold).

```sh
npm ci
npm run dev
```

Open http://localhost:3000. `/dashboard` manages the roster and historical lineups; `/players` provides search, season averages, and per-game history; `/watchlist` stores personal notes. A missing dataset has a setup state. Search/history/watchlists use bounded 20-row pages. Positions remain unknown where the imported source lacks them.

For local development, install Docker and Supabase CLI (verification used CLI 2.120.0), then run:

```sh
supabase start
supabase migration up --local
npm run dev:local
```

`dev:local` discovers only the running loopback stack, overrides hosted public variables from `.env.local`, and uses `APP_URL=http://localhost:3000`. It never forwards importer credentials. Do not reset the existing populated database. Apply both additional player-query migrations in order. A fresh empty stack needs a dataset import; reuse the CSVs selected by `data/CURRENT` when available. Synthetic CI setup is described below.

Add these application variables to your ignored `.env.local` using the placeholders in `.env.example`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

Find both in the Supabase project's Connect dialog. Restart the development server after changing them. Keep `SUPABASE_DB_URL` in the importer-only `.env`; do not copy privileged credentials into public variables. Next.js loads `.env` too, but application clients reference only the two public variables above. The browser and server clients both use the signed-in session so database RLS applies. The proxy refreshes session cookies; protected pages and server mutations verify the session before accessing private data.

```sh
npm run lint
npm run typecheck
npm run build
npm start
```

The production build uses the supported webpack compiler. Turbopack's CSS worker could not bind its port in this execution environment, including with expanded execution permissions; webpack preserves the CSS and installed versions and reproduces passing builds. Fresh audit on 2026-10-12 reports five high-severity development findings in the Next.js lint plugin → `fast-glob` / `micromatch` / `braces` chain; `npm audit --omit=dev` reports zero findings. The suggested automatic fix downgrades `eslint-config-next` to 14.2.35, which is incompatible with this installed Next.js version. No dependency downgrade/upgrade was made; review a compatible fix when available.

Dependencies are pinned in `package.json` and `package-lock.json`. `lib/supabase/client.ts` serves Client Components; `lib/supabase/server.ts` serves Server Components, Server Actions, and Route Handlers. The setup follows the [Supabase SSR guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs) and [Next.js installation guide](https://nextjs.org/docs/app/getting-started/installation).

## Application implementation

The initial database migration is `supabase/migrations/20261012042000_roster_planner.sql`. It defines shared NBA tables, import metadata, private rosters/watchlists/lineups, RLS policies, season averages, and authenticated RPCs:

- `ensure_roster()` initializes the signed-in user's roster once.
- `add_roster_player(p_player_id)` rejects duplicates and capacity overflow.
- `remove_roster_player(p_player_id)` preserves historical lineups.
- `save_lineup(p_date, p_starters)` atomically saves five ordered starters plus the remaining bench.

Membership and lineup changes must use the RPCs; direct client writes are denied. The functions serialize changes by locking the parent roster. Roster names and watchlist notes can be updated through ordinary authenticated table requests. The importer must publish shared data and successful metadata in one transaction.

All three migrations are applied locally. The database gate enforces 280 pgTAP assertions, including the original 18; eight independent-transaction tests prove actual lock overlap and serial roster/lineup outcomes. The importer regression suite verifies repeat import and late-failure rollback. Application requests use signed-in publishable clients; privileged clients are restricted to local test setup and the importer. Hosted migration/import, deployment, and production email configuration remain release work.

## Import into Supabase

Install the pinned dependencies from `requirements.lock.txt`. The importer uses PostgreSQL directly so all upserts and successful metadata publish in one transaction; separate REST requests would not provide this guarantee. It validates hashes, counts, keys, required statistics, dates, and historical relationships before connecting. It loads teams, players, games, then appearances using temporary staging tables and verifies stored values and season counts before committing. Concurrent imports are serialized; any error rolls back the entire publication. No shared or private records are deleted. Unexpected extra games/appearances in the target season cause verification to fail rather than silently changing history.

```sh
.venv/bin/python scripts/nba/import_dataset.py --validate-only
```

Copy `.env.example` to the ignored `.env` and fill in `SUPABASE_DB_URL` using the Supabase Dashboard **Connect** panel. Use a privileged PostgreSQL direct connection or session pooler URL (port 5432), with `sslmode=require` for hosted Supabase. URL-encode special characters in the password. These are database credentials, not the publishable API key or service-role API key. The importer never prints the connection URL or raw driver errors. It reads the exported environment; it does not automatically load `.env`.

[Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres) explains direct versus session-pooler connections.

```sh
# .env contains shell-compatible assignments; keep it local.
set -a
source .env
set +a
.venv/bin/python scripts/nba/import_dataset.py
# Repeat safely: rows are updated, not duplicated; metadata records one row per version.
.venv/bin/python scripts/nba/import_dataset.py
```

For the standard local Supabase instance, use `postgresql://postgres:postgres@127.0.0.1:54322/postgres` instead. That local development password is not a hosted credential. The local import is already complete.

```sh
# Required local full-data gate. No hosted credential fallback and no skips.
npm run test:full-data
```

The strict wrapper fixes the PostgreSQL target to `127.0.0.1:54322/postgres`, requires the selected complete dataset, and fails on required skips. The standalone legacy Python integration test is opt-in and also rejects hosted targets; use the wrapper for an acceptance gate. Database fixtures roll back, and concurrency/browser accounts are unique and cleaned up. No routine test reads hosted credentials from environment files.

The prior source-use review is retained in `docs/data-feasibility.md`; the completed technical collection does not resolve its documented fantasy-use concern for publication.

## Dataset

The completed collection contains **1,230 games, 26,651 player appearances, 582 players, and 30 teams**, covering **2025-10-21 through 2026-04-12**. Playoffs, play-in games, and the NBA Cup championship are excluded by the regular-season endpoint and game-ID validation. Cup games that count toward the regular season remain included.

`data/CURRENT` identifies the validated version directory. That directory contains:

| File | Contents |
| --- | --- |
| `teams.csv` | NBA team ID, name, abbreviation |
| `players.csv` | NBA player ID, full name, nullable position |
| `games.csv` | Text game ID, season, date, designated home/away teams, final scores |
| `player_games.csv` | One appearance per player/game, historical team and opponent, designated home flag, minutes, counting and shooting statistics |
| `metadata.json` | Attribution, timestamps, counts, bounds, validation results, corrections, SHA-256 hashes |

Source: **NBA.com**, accessed through `nba_api`. Retain attribution and original source notices with local data. Data and the Python environment are ignored by Git. The local dataset is ready to use; application persistence uses Supabase.

## Reproduce

Verified with Python 3.9.6 on macOS ARM64 and `nba_api` 1.10.2. This older system Python emits a LibreSSL compatibility warning from urllib3; collection succeeded on this machine. Prefer a supported Python installation built with OpenSSL for continued work. The lockfile captures the exact dependencies used here; cross-platform compatibility has not been tested.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock.txt
.venv/bin/python scripts/nba/probe.py
.venv/bin/python scripts/nba/collect.py
.venv/bin/python -m unittest discover -s tests -v
```

The probe requests only three opening-season dates. The collector requests team and player season logs, then box scores for ambiguous home/away relationships and a representative statistical check. Requests have timeouts, bounded retries, and three-second pacing. Raw responses are saved in `data/raw/` and reused on reruns. To collect fresh responses, move that raw directory aside before rerunning. API access may vary by network; access denials must not be bypassed.

Every successful run creates a new version and atomically updates `data/CURRENT`. A failed validation leaves the previous pointer and dataset intact. Consumers should read the pointer once and load all files from that version. Old versions remain available. Failed, unpublished output directories may remain for inspection.

## Load for ML

```python
from pathlib import Path
import pandas as pd

root = Path('data')
version = root / (root / 'CURRENT').read_text().strip()
appearances = pd.read_csv(
    version / 'player_games.csv',
    dtype={'game_id': 'string'},
    parse_dates=['game_date'],
)
games = pd.read_csv(version / 'games.csv', dtype={'id': 'string'})
players = pd.read_csv(version / 'players.csv')
```

Always load game IDs as strings to retain leading zeroes. All counting statistics and minutes are validated as available and nonnegative; missing values are never replaced with zero. Position is unavailable from these logs and remains blank/unknown.

Minutes are whole-minute values supplied by the game-log endpoint, not precise playing durations. Preserve zero-minute appearance records: rounding to zero does not establish that a player did not play. The directory includes only players appearing in these logs. A sample box score confirmed 20 appearances and excluded seven DNP/DND entries; that check is representative, not a full-season audit of all inactive players.

Five games had contradictory away markers in the source logs. Their designated home teams were resolved from NBA box scores and recorded in metadata. `is_home` means the NBA's designated home team, including neutral-site games; it does not imply home-court location. Other game/stat validations include 82 games per team, two opposing teams per game, unique player/game keys, consistent dates, valid foreign keys, shooting/rebound relationships, and player/team sums for selected statistics. Team-only turnovers and rebounds are not expected to equal player sums.

Use chronological train/validation/test splits for future-performance prediction. Construct rolling features using prior games only (shift before rolling). Same-game scores, shooting results, minutes, and other completed-game statistics can leak a prediction target. Neither full-season aggregates nor the presence of a player's appearance should be treated as pregame knowledge when modeling availability.

No model or training target is selected yet. The raw appearance dataset supports choosing those separately.

## Authentication setup

Set `APP_URL=http://localhost:3000` in `.env.local`; use your canonical HTTPS application origin in production. The application never derives email destinations from request headers. In Supabase **Authentication → URL Configuration**, set Site URL to that origin and allow these redirect URLs (replace the origin for deployment):

- `http://localhost:3000/auth/callback`
- `http://localhost:3000/auth/callback?next=/update-password`

The default confirmation/recovery emails use PKCE callbacks. Open those links in the same browser that requested them. For links that also work across browsers, configure the email templates using the [Supabase token-hash flow](https://supabase.com/docs/guides/auth/auth-email-templates):

- Confirm signup link: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
- Reset password link: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`

With email confirmation enabled, registration displays a check-email message. With confirmation disabled, registration signs in immediately. Passwords must be 8–128 characters; Supabase may impose stronger project-specific rules. Reset requests display an account-neutral success message. Expired/invalid email links lead to a recovery page. Signed-in users can also change their password at `/update-password`.

`/dashboard` requires verified claims and initializes the user's roster through `ensure_roster()` on authenticated use. Repeated visits reuse the existing roster. All private reads and mutations use the session-bound publishable client, with RLS applied. Sign-out returns to `/sign-in`.

Hosted email delivery, project email templates, and production callback configuration require verification against the hosted project before deployment.

### Local test gates

Create `.venv` with the pinned requirements if it does not already exist:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock.txt
```

With the migrated populated local stack running and email confirmation disabled (the normal local setting):

```sh
npx playwright install chromium
npm run test:auth
npm run test:unit
npm run test:db
npm run test:concurrency
npm run test:full-data
npm run test:e2e:production
```

`test:auth` stays focused; `test:e2e` runs the ordinary full suite in development; `test:e2e:production` builds and starts the application with the **same** local public variables at build and runtime on port 3101. All override hosted `.env.local` values and refuse alternate targets. Temporary account teardown is checked. Required SQL failures, plan mismatches, incomplete execution, missing services/data, and required skips fail their runners. Transaction races prove overlap rather than using browser request scheduling as concurrency evidence. Run browser/confirmation suites sequentially; port reuse is deliberately disabled.

For real confirmation and recovery mail, run the dedicated controlled gate:

```sh
npm run test:confirmation
```

It temporarily enables **local** email confirmation and adds port-3101 redirects, restarts Supabase while preserving data volumes, builds/tests against local mail at http://127.0.0.1:54324, then restores the original config bytes and normal disabled mode in `finally`. It verifies unchanged shared/private/account counts and deletes only the test recipient's mail. It does not change hosted Auth settings or exhaust a mail provider. Do not run it alongside another local test or app session. If killed before restoration, recover `supabase/config.toml` from `supabase/.confirmation-test-lock/original-config.toml`, restart the stack with `supabase stop` then `supabase start`, verify normal settings/data, and remove the lock only after recovery. Never use `stop --no-backup` on the populated development stack.

The tests retain generated token-hash coverage; actual local email tests separately verify same-browser PKCE. Hosted email delivery and production redirects still require M6 verification. When configuring local Auth manually, set `site_url` and `additional_redirect_urls` in `supabase/config.toml` to match the application/callback origins listed above, then restart the stack without resetting data.

### Synthetic CI versus complete dataset

[The CI workflow](.github/workflows/local-tests.yml) creates its own disposable Docker stack, applies migrations, and seeds fictional teams/players/appearances using `scripts/testing/seed_synthetic.py`. It tests zero minutes, unknown positions, traded-player relationships, literal search, history pagination, and no-game dates without publishing NBA data. The seeder refuses existing shared/private/auth rows. Its rollback-only insertion check also runs safely alongside the full dataset.

Ordinary CI does **not** prove complete NBA collection integrity: ignored `data/` is absent from a checkout. `npm run test:full-data` on the retained complete dataset remains required for importer/data changes and final local acceptance. Do not replace it with the synthetic gate or skip it silently. See [progress evidence](docs/mvp-progress.md), [rendered usability review](docs/usability-review.md), and [M6 release checklist](docs/mvp-acceptance.md).
