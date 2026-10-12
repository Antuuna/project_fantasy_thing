"""Seed an EMPTY disposable loopback database. Never replaces existing data.

Ordinary CI uses fictional fixtures; complete NBA importer tests are a separate gate.
"""
import argparse
import json
import os
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlsplit

FIXTURE = Path(__file__).resolve().parents[2] / 'tests/fixtures/synthetic-season.json'
TABLES = ('nba_teams', 'nba_players', 'nba_games', 'nba_player_game_stats',
          'nba_dataset_imports', 'rosters', 'roster_members', 'watchlist_entries',
          'lineup_entries')


def require_local_target(url):
    """Reject alternate hosts, Unix sockets, and libpq query-parameter overrides."""
    parsed = urlsplit(url)
    if (parsed.scheme not in ('postgres', 'postgresql') or
            parsed.hostname != '127.0.0.1' or parsed.port != 54322 or
            parsed.path != '/postgres' or parsed.query or parsed.fragment or
            parsed.username != 'postgres'):
        raise ValueError('Synthetic fixtures require postgres at 127.0.0.1:54322/postgres with no URL options')
    return url


def verify_fixture(conn, fixture):
    """Independent calculations prove averages, IDs, dates, and historical teams."""
    def one(query, params=()):
        return conn.execute(query, params).fetchone()[0]

    def check(condition, message):
        if not condition:
            raise ValueError('Synthetic fixture assertion failed: ' + message)

    check(one('select count(*) from public.nba_dataset_imports where dataset_version = %s',
              (fixture['version'],)) == 1, 'fixture import metadata')
    for table, key in [('nba_teams', 'teams'), ('nba_players', 'players'),
                       ('nba_games', 'games'), ('nba_player_game_stats', 'stats')]:
        check(one('select count(*) from public.' + table) == len(fixture[key]), table + ' count')
    check(one('select count(distinct player_id) from public.nba_player_game_stats') == 24,
          '24 appearing players')
    check(one('select position is null from public.nba_players where id = 990002'), 'unknown position')
    check(one("select minutes from public.nba_player_game_stats where player_id = 990002 and game_id = '0022599001'") == 0,
          'zero-minute appearance retained')
    for player in (990001, 990002):
        rows = [row for row in fixture['stats'] if row[0] == player]
        expected = [sum(Decimal(str(row[index])) for row in rows) / len(rows) for index in range(3, 10)]
        actual = conn.execute('select appearances, minutes, points, rebounds, assists, steals, blocks, turnovers '
                              'from public.nba_player_season_averages where player_id = %s and season = %s',
                              (player, fixture['season'])).fetchone()
        check(actual is not None and actual[0] == len(rows), 'appearance denominator')
        check(all(abs(a - b) < Decimal('0.000000001') for a, b in zip(actual[1:], expected)),
              'unrounded appearance-based averages')
    teams = conn.execute('select distinct team_id from public.nba_player_game_stats where player_id = 990001 order by team_id').fetchall()
    check(teams == [(9901,), (9902,)], 'traded player historical teams')
    check(one('select count(*) from public.nba_games where game_date = %s', (fixture['no_game_date'],)) == 0,
          'in-range no-game date')
    bounds = conn.execute('select min(game_date)::text, max(game_date)::text from public.nba_games').fetchone()
    check(bounds == (fixture['date_min'], fixture['date_max']), 'inclusive historical bounds')
    ids = [row[0] for row in conn.execute('select id from public.nba_games order by id')]
    check(ids == sorted(row[0] for row in fixture['games']), 'leading-zero textual IDs')
    check(one('select count(*) from public.nba_player_season_averages where player_id = 990099') == 0,
          'nonappearing player excluded from season averages')
    check(one('select count(*) from public.nba_player_game_stats s join public.nba_games g on g.id=s.game_id '
              'where s.team_id not in (g.home_team_id, g.away_team_id)') == 0, 'historical team relationships')


def seed(conn, fixture):
    # Take all locks before checking emptiness, so another writer cannot race setup.
    conn.execute('set local lock_timeout = \'5s\'')
    conn.execute('lock table ' + ', '.join('public.' + table for table in TABLES) + ', auth.users in access exclusive mode')
    for table in (*('public.' + table for table in TABLES), 'auth.users'):
        if conn.execute('select exists(select 1 from ' + table + ')').fetchone()[0]:
            raise ValueError('Refusing synthetic seed: existing data in ' + table + '; use an empty disposable stack')
    insert_fixture(conn, fixture)
    verify_fixture(conn, fixture)


def insert_fixture(conn, fixture):
    """Internal insertion helper; caller owns transaction and safety checks."""
    with conn.cursor() as cursor:
        cursor.executemany('insert into public.nba_teams(id,name,abbreviation) values (%s,%s,%s)', fixture['teams'])
        cursor.executemany('insert into public.nba_players(id,full_name,position) values (%s,%s,%s)', fixture['players'])
        cursor.executemany('insert into public.nba_games(id,season,game_date,home_team_id,away_team_id,home_points,away_points) '
                           'values (%s,%s,%s,%s,%s,%s,%s)', fixture['games'])
        cursor.executemany('insert into public.nba_player_game_stats(player_id,game_id,team_id,minutes,points,rebounds,assists,steals,blocks,turnovers) '
                           'values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)', fixture['stats'])
        counts = {key: len(fixture[key]) for key in ('teams', 'players', 'games')}
        counts['player_games'] = len(fixture['stats'])
        cursor.execute('insert into public.nba_dataset_imports(season,source,dataset_version,row_counts,date_min,date_max) '
                       'values (%s,%s,%s,%s::jsonb,%s,%s)',
                       (fixture['season'], fixture['label'], fixture['version'], json.dumps(counts),
                        fixture['date_min'], fixture['date_max']))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Verify existing synthetic fixtures without writing')
    args = parser.parse_args()
    url = require_local_target(os.environ.get('SUPABASE_TEST_DB_URL', ''))
    import psycopg
    fixture = json.loads(FIXTURE.read_text())
    with psycopg.connect(url, connect_timeout=5) as conn:
        if args.check:
            conn.execute('set transaction read only')
            verify_fixture(conn, fixture)
        else:
            seed(conn, fixture)
    print('Synthetic fixture checks passed' if args.check else 'Synthetic fixtures seeded and checked; no real NBA data used')


if __name__ == '__main__':
    main()
