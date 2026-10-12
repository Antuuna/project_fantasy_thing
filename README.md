# Fantasy Basketball Roster Planner

The active objective is the fantasy roster application in `IMPLEMENTATION.md`, using the existing local 2025–26 NBA regular-season dataset. Data acquisition is complete. The dataset was originally collected for private ML practice; that earlier project scope has been superseded.

## Application implementation

The initial database migration is `supabase/migrations/20261012042000_roster_planner.sql`. It defines shared NBA tables, import metadata, private rosters/watchlists/lineups, RLS policies, season averages, and authenticated RPCs:

- `ensure_roster()` initializes the signed-in user's roster once.
- `add_roster_player(p_player_id)` rejects duplicates and capacity overflow.
- `remove_roster_player(p_player_id)` preserves historical lineups.
- `save_lineup(p_date, p_starters)` atomically saves five ordered starters plus the remaining bench.

Membership and lineup changes must use the RPCs; direct client writes are denied. The functions serialize changes by locking the parent roster. Roster names and watchlist notes can be updated through ordinary authenticated table requests. The importer must publish shared data and successful metadata in one transaction.

The migration is applied to the local Supabase development database, and all 18 pgTAP checks pass. The full validated dataset has been imported locally twice without duplicates. All 12 Python checks pass, including a PostgreSQL integration test that injects a failed refresh and verifies data and metadata preservation. Broader two-user mutation coverage and concurrent roster/lineup-write verification remain required. Cloud import, frontend, and deployment are not yet verified.

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
# Opt-in database integration test: use a disposable migrated database.
# Successful imports and the injected failure are all rolled back by the test.
export SUPABASE_TEST_DB_URL="$SUPABASE_DB_URL"
.venv/bin/python -m unittest discover -s tests -v
```

The integration test checks repeated upserts, one metadata record per version, and rollback after a late foreign-key error. Without `SUPABASE_TEST_DB_URL`, that test is explicitly skipped. Run `supabase/tests/roster_planner.sql` against the disposable development database for the 18 schema/RLS checks. These tests do not yet establish concurrent roster/lineup safety.

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

Source: **NBA.com**, accessed through `nba_api`. Retain attribution and original source notices with local data. Data and the Python environment are ignored by Git. The local dataset is ready to use; application persistence will use Supabase.

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
