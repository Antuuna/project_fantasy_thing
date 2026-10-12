"""Validate existing CSVs and atomically upsert them into Supabase PostgreSQL."""
import argparse
import csv
import hashlib
import io
import json
import os
import re
from datetime import date
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / 'data'
TABLES = {
    'teams': ('nba_teams', ('id', 'name', 'abbreviation'), ('id',)),
    'players': ('nba_players', ('id', 'full_name', 'position'), ('id',)),
    'games': ('nba_games', ('id', 'season', 'game_date', 'home_team_id', 'away_team_id', 'home_points', 'away_points'), ('id',)),
    'player_games': ('nba_player_game_stats', ('player_id', 'game_id', 'team_id', 'minutes', 'points', 'rebounds', 'assists', 'steals', 'blocks', 'turnovers'), ('player_id', 'game_id')),
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def load_dataset(root=ROOT):
    root = root.resolve()
    version = (root / (root / 'CURRENT').read_text().strip()).resolve()
    require(version.parent == root / 'versions', 'CURRENT must select a directory under data/versions')
    metadata = json.loads((version / 'metadata.json').read_text())
    require(metadata['season'] == '2025-26' and metadata['season_type'] == 'Regular Season', 'Unsupported season')
    tables = {}
    for name, (_, columns, keys) in TABLES.items():
        path = version / (name + '.csv')
        payload = path.read_bytes()
        require(hashlib.sha256(payload).hexdigest() == metadata['sha256'][path.name], 'CSV checksum mismatch: ' + name)
        reader = csv.DictReader(io.StringIO(payload.decode('utf-8'), newline=''))
        require(set(columns).issubset(reader.fieldnames or []), 'Missing columns: ' + name)
        rows = list(reader)
        require(len(rows) == metadata['counts'][name] and rows, 'Row count mismatch: ' + name)
        seen = set()
        for row in rows:
            require(None not in row and all(v is not None for v in row.values()), 'Malformed CSV row: ' + name)
            key = tuple(row[k] for k in keys)
            require(key not in seen, 'Duplicate key: ' + name)
            seen.add(key)
            for column in columns:
                value = row[column]
                if column == 'position':
                    row[column] = value or None
                elif column in ('name', 'full_name', 'abbreviation', 'season'):
                    require(bool(value.strip()), 'Missing text: ' + column)
                elif column == 'game_date':
                    require(date.fromisoformat(value).isoformat() == value, 'Invalid game date')
                elif column == 'game_id' or (name == 'games' and column == 'id'):
                    require(bool(re.fullmatch(r'00225\d{5}', value)), 'Invalid text game ID')
                elif column == 'minutes':
                    number = Decimal(value)
                    require(number.is_finite() and number >= 0, 'Invalid minutes')
                    row[column] = number
                else:
                    require(bool(re.fullmatch(r'\d+', value)), 'Missing/invalid integer: ' + column)
                    row[column] = int(value)
                    if column.endswith('_id') or column == 'id':
                        require(row[column] > 0, 'Invalid identity')
        tables[name] = rows
    teams = {r['id'] for r in tables['teams']}
    players = {r['id'] for r in tables['players']}
    games = {r['id']: r for r in tables['games']}
    for game in games.values():
        require(game['season'] == metadata['season'], 'Game season mismatch')
        require(game['home_team_id'] in teams and game['away_team_id'] in teams and game['home_team_id'] != game['away_team_id'], 'Invalid game teams')
    dates = [g['game_date'] for g in games.values()]
    require(min(dates) == metadata['date_min'] and max(dates) == metadata['date_max'], 'Date bounds mismatch')
    appeared = set()
    covered = set()
    for row in tables['player_games']:
        game = games.get(row['game_id'])
        require(game is not None and row['player_id'] in players, 'Unresolved appearance foreign key')
        require(row['team_id'] in (game['home_team_id'], game['away_team_id']), 'Historical team mismatch')
        require(row['season'] == game['season'] and row['game_date'] == game['game_date'], 'Appearance season/date mismatch')
        opponent = game['away_team_id'] if row['team_id'] == game['home_team_id'] else game['home_team_id']
        require(row['opponent_team_id'] == str(opponent) and row['is_home'] == str(int(row['team_id'] == game['home_team_id'])), 'Historical opponent/home mismatch')
        appeared.add(row['player_id'])
        covered.add((row['game_id'], row['team_id']))
    require(appeared == players, 'Player directory must contain only appearances')
    require(covered == {(g['id'], t) for g in games.values() for t in (g['home_team_id'], g['away_team_id'])}, 'Missing team appearances')
    return version.name, metadata, tables


def publish(connection, version, metadata, tables):
    """Caller owns the transaction: any error must roll back all writes."""
    from psycopg import sql
    with connection.cursor() as cursor:
        cursor.execute("set local lock_timeout = '30s'")
        cursor.execute("set local statement_timeout = '120s'")
        cursor.execute('select pg_advisory_xact_lock(20261012, 1)')
        # Serializes other writers too, ensuring verification describes this publication.
        cursor.execute('lock table public.nba_teams, public.nba_players, public.nba_games, public.nba_player_game_stats, public.nba_dataset_imports in share row exclusive mode')
        for name, (table, columns, keys) in TABLES.items():
            target = sql.Identifier('public', table)
            staging = sql.Identifier('stage_' + name)
            fields = sql.SQL(', ').join(map(sql.Identifier, columns))
            cursor.execute(sql.SQL('create temporary table {} (like {} including defaults) on commit drop').format(staging, target))
            with cursor.copy(sql.SQL('copy {} ({}) from stdin').format(staging, fields)) as copy:
                for row in tables[name]:
                    copy.write_row(tuple(row[c] for c in columns))
            updates = sql.SQL(', ').join(sql.SQL('{} = excluded.{}').format(sql.Identifier(c), sql.Identifier(c)) for c in columns if c not in keys)
            cursor.execute(sql.SQL('insert into {} ({}) select {} from {} on conflict ({}) do update set {}').format(target, fields, fields, staging, sql.SQL(', ').join(map(sql.Identifier, keys)), updates))
            # Verify every staged value, including numeric precision and text IDs.
            cursor.execute(sql.SQL('select {} from {} except select {} from {} limit 1').format(fields, staging, fields, target))
            require(cursor.fetchone() is None, 'Database value verification failed: ' + name)
            cursor.execute(sql.SQL('drop table {}').format(staging))
        cursor.execute('select count(*), min(game_date)::text, max(game_date)::text from public.nba_games where season = %s', (metadata['season'],))
        require(cursor.fetchone() == (len(tables['games']), metadata['date_min'], metadata['date_max']), 'Database season bounds/count mismatch')
        cursor.execute('select count(*) from public.nba_player_game_stats s join public.nba_games g on g.id = s.game_id where g.season = %s', (metadata['season'],))
        require(cursor.fetchone()[0] == len(tables['player_games']), 'Database appearance count mismatch')
        cursor.execute('''insert into public.nba_dataset_imports
            (season, source, dataset_version, row_counts, date_min, date_max)
            values (%s, %s, %s, %s::jsonb, %s, %s)
            on conflict (dataset_version) do update set
            season = excluded.season, source = excluded.source, row_counts = excluded.row_counts,
            date_min = excluded.date_min, date_max = excluded.date_max, completed_at = now()''',
            (metadata['season'], metadata['source'], version, json.dumps(metadata['counts']), metadata['date_min'], metadata['date_max']))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--validate-only', action='store_true', help='Validate CSVs without database access')
    args = parser.parse_args()
    try:
        version, metadata, tables = load_dataset()
        if not args.validate_only:
            require(bool(os.environ.get('SUPABASE_DB_URL')), 'Set SUPABASE_DB_URL to a privileged PostgreSQL connection URL')
            import psycopg
            with psycopg.connect(os.environ['SUPABASE_DB_URL'], connect_timeout=15, prepare_threshold=None) as connection:
                publish(connection, version, metadata, tables)
        print(json.dumps({'status': 'validated' if args.validate_only else 'imported', 'dataset_version': version, 'counts': metadata['counts'], 'date_min': metadata['date_min'], 'date_max': metadata['date_max']}, indent=2))
    except Exception as error:
        # Driver errors may contain credentials or row data. Never print those.
        if isinstance(error, ValueError):
            parser.exit(1, 'Import failed: ' + str(error) + '\n')
        parser.exit(1, 'Import failed (' + type(error).__name__ + '); no partial publication committed. Check connection/configuration.\n')


if __name__ == '__main__':
    main()
