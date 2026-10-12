"""Collect and atomically publish a validated, local 2025–26 ML dataset."""
import csv
import hashlib
import json
import math
import os
import re
import time
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

from nba_api.stats.endpoints.leaguegamelog import LeagueGameLog
from nba_api.stats.endpoints.boxscoretraditionalv3 import BoxScoreTraditionalV3
from requests.exceptions import RequestException

SEASON = '2025-26'
ROOT = Path(__file__).resolve().parents[2] / 'data'
RAW = ROOT / 'raw'
COUNTS = {'PTS': 'points', 'REB': 'rebounds', 'AST': 'assists',
          'STL': 'steals', 'BLK': 'blocks', 'TOV': 'turnovers',
          'FGM': 'field_goals_made', 'FGA': 'field_goals_attempted',
          'FG3M': 'three_pointers_made', 'FG3A': 'three_pointers_attempted',
          'FTM': 'free_throws_made', 'FTA': 'free_throws_attempted',
          'OREB': 'offensive_rebounds', 'DREB': 'defensive_rebounds',
          'PF': 'personal_fouls'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def fetch(name, factory):
    RAW.mkdir(parents=True, exist_ok=True)
    path = RAW / name
    if path.exists():
        return json.loads(path.read_text())
    for attempt in range(3):
        try:
            endpoint = factory()
            payload = json.loads(endpoint.get_json())
            temporary = path.with_suffix('.tmp')
            temporary.write_text(json.dumps(payload))
            temporary.replace(path)
            print(f'Saved {name}', flush=True)
            time.sleep(3)
            return payload
        except RequestException as exc:
            print(f'{name}: attempt {attempt + 1}: {type(exc).__name__}', flush=True)
            if getattr(exc, 'response', None) is not None:
                if exc.response.status_code in (401, 403):
                    raise
            if attempt == 2:
                raise
            time.sleep(5 * (attempt + 1))


def rows(payload):
    datasets = payload['resultSets']
    dataset = next(d for d in datasets if d['name'] == 'LeagueGameLog')
    require(len(set(dataset['headers'])) == len(dataset['headers']), 'Duplicate headers')
    require(all(len(r) == len(dataset['headers']) for r in dataset['rowSet']), 'Row width mismatch')
    return [dict(zip(dataset['headers'], row)) for row in dataset['rowSet']]


def identity(row):
    game_id = row['GAME_ID']
    require(isinstance(game_id, str) and re.fullmatch(r'00225\d{5}', game_id),
            f'Unexpected regular-season game ID: {game_id!r}')
    require(row['SEASON_ID'] == '22025', f'Wrong season: {row["SEASON_ID"]}')
    day = date.fromisoformat(row['GAME_DATE'])
    require(date(2025, 10, 1) <= day <= date(2026, 4, 30), f'Unexpected date: {day}')
    require(type(row['TEAM_ID']) is int, 'Team ID is not integer')
    return game_id


def normalize(team_rows, player_rows, home_overrides=None):
    home_overrides = home_overrides or {}
    teams, players, games, stats = {}, {}, {}, []
    grouped = defaultdict(list)
    for row in team_rows:
        grouped[identity(row)].append(row)
        team = {'id': row['TEAM_ID'], 'name': row['TEAM_NAME'],
                'abbreviation': row['TEAM_ABBREVIATION']}
        require(team['id'] not in teams or teams[team['id']] == team, 'Conflicting team identity')
        teams[team['id']] = team
    require(len(teams) == 30, f'Expected 30 teams, got {len(teams)}')
    require(len(grouped) == 1230, f'Expected 1230 regular-season games, got {len(grouped)}')
    require(set(Counter(r['TEAM_ID'] for r in team_rows).values()) == {82}, 'Each team must have 82 games')
    for game_id, pair in grouped.items():
        require(len(pair) == 2, f'{game_id}: expected two teams')
        home = [r for r in pair if ' vs. ' in r['MATCHUP']]
        away = [r for r in pair if ' @ ' in r['MATCHUP']]
        if game_id in home_overrides:
            home = [r for r in pair if r['TEAM_ID'] == home_overrides[game_id]]
            away = [r for r in pair if r['TEAM_ID'] != home_overrides[game_id]]
        require(len(home) == len(away) == 1, f'{game_id}: ambiguous home/away')
        h, a = home[0], away[0]
        require(h['TEAM_ID'] != a['TEAM_ID'] and h['GAME_DATE'] == a['GAME_DATE'], 'Invalid game relationship')
        for own, other in ((h, a), (a, h)):
            require(own['MATCHUP'] in (f'{own["TEAM_ABBREVIATION"]} vs. {other["TEAM_ABBREVIATION"]}',
                                      f'{own["TEAM_ABBREVIATION"]} @ {other["TEAM_ABBREVIATION"]}'), 'Matchup mismatch')
        require({h['WL'], a['WL']} == {'W', 'L'}, 'Invalid outcome')
        require((h['PTS'] > a['PTS']) == (h['WL'] == 'W'), 'Score/outcome mismatch')
        games[game_id] = {'id': game_id, 'season': SEASON, 'game_date': h['GAME_DATE'],
                          'home_team_id': h['TEAM_ID'], 'away_team_id': a['TEAM_ID'],
                          'home_points': h['PTS'], 'away_points': a['PTS']}
    seen = set()
    totals = defaultdict(Counter)
    for row in player_rows:
        game_id = identity(row)
        player_id, team_id = row['PLAYER_ID'], row['TEAM_ID']
        require(type(player_id) is int and player_id > 0, 'Invalid player ID')
        require(game_id in games and team_id in teams, 'Unresolved foreign key')
        game = games[game_id]
        require(team_id in (game['home_team_id'], game['away_team_id']), 'Player team absent from game')
        require(row['GAME_DATE'] == game['game_date'], 'Player date mismatch')
        require((player_id, game_id) not in seen, f'Duplicate player/game: {player_id}/{game_id}')
        seen.add((player_id, game_id))
        # This endpoint returns appearance logs, not complete game rosters.
        # Preserve zero-minute rows: whole-minute rounding does not establish DNP.
        minutes = row['MIN']
        require(type(minutes) in (int, float) and math.isfinite(minutes) and minutes >= 0,
                f'Invalid/missing minutes: {player_id}/{game_id}')
        name = row['PLAYER_NAME']
        require(isinstance(name, str) and name.strip(), 'Missing player name')
        require(player_id not in players or players[player_id]['full_name'] == name, 'Conflicting player name')
        players[player_id] = {'id': player_id, 'full_name': name, 'position': None}
        stat = {'player_id': player_id, 'game_id': game_id, 'season': SEASON,
                'game_date': game['game_date'], 'team_id': team_id,
                'opponent_team_id': game['away_team_id'] if team_id == game['home_team_id'] else game['home_team_id'],
                'is_home': int(team_id == game['home_team_id']), 'minutes': minutes}
        for source, field in COUNTS.items():
            value = row[source]
            require(type(value) is int and value >= 0, f'Invalid/missing {source}: {player_id}/{game_id}')
            stat[field] = value
            totals[(game_id, team_id)][source] += value
        require(stat['rebounds'] == stat['offensive_rebounds'] + stat['defensive_rebounds'], 'Rebound mismatch')
        for made, attempted in [('FGM', 'FGA'), ('FG3M', 'FG3A'), ('FTM', 'FTA')]:
            require(row[made] <= row[attempted], 'Made exceeds attempts')
        stats.append(stat)
    require(stats, 'Empty player dataset')
    for row in team_rows:
        key = (row['GAME_ID'], row['TEAM_ID'])
        require(key in totals, f'No player appearances for {key}')
        # Team turnovers/rebounds can include team-only events, so do not equate those.
        for field in ('PTS', 'AST', 'STL', 'BLK', 'FGM', 'FGA', 'FG3M', 'FG3A', 'FTM', 'FTA', 'PF'):
            require(totals[key][field] == row[field], f'{key}: player/team {field} mismatch')
    return list(teams.values()), list(players.values()), list(games.values()), stats


def check_box(payload, stats, game_id):
    box = payload['boxScoreTraditional']
    entries = box['homeTeam']['players'] + box['awayTeam']['players']
    game_stats = {s['player_id']: s for s in stats if s['game_id'] == game_id}
    played, excluded = set(), []
    mappings = {'points': 'points', 'reboundsTotal': 'rebounds', 'assists': 'assists',
                'steals': 'steals', 'blocks': 'blocks', 'turnovers': 'turnovers'}
    for player in entries:
        pid = player['personId']
        clock = player['statistics']['minutes']
        if not clock:
            require(pid not in game_stats, f'Non-playing box entry included: {pid}')
            excluded.append({'player_id': pid, 'comment': player['comment'], 'minutes': clock})
        else:
            played.add(pid)
            require(pid in game_stats, f'Played box entry missing: {pid}')
            for source, field in mappings.items():
                require(player['statistics'][source] == game_stats[pid][field], f'Box mismatch: {pid}/{field}')
    require(played == set(game_stats), 'Box/log player sets differ')
    return {'game_id': game_id, 'matched_appearances': len(played), 'excluded_nonplaying': excluded}


def main():
    logs = []
    for mode in ('T', 'P'):
        payload = fetch(f'league_game_log_{SEASON}_{mode}.json', lambda: LeagueGameLog(
            season=SEASON, season_type_all_star='Regular Season',
            player_or_team_abbreviation=mode, timeout=45))
        logs.append(rows(payload))
    grouped = defaultdict(list)
    for row in logs[0]:
        grouped[row['GAME_ID']].append(row)
    overrides = {}
    for game_id, pair in grouped.items():
        if sum(' vs. ' in r['MATCHUP'] for r in pair) != 1:
            box = fetch(f'box_{game_id}.json', lambda: BoxScoreTraditionalV3(game_id=game_id, timeout=30))
            overrides[game_id] = box['boxScoreTraditional']['homeTeam']['teamId']
    teams, players, games, stats = normalize(*logs, home_overrides=overrides)
    sample_id = min(g['id'] for g in games)
    box = fetch(f'box_{sample_id}.json', lambda: BoxScoreTraditionalV3(game_id=sample_id, timeout=30))
    box_check = check_box(box, stats, sample_id)
    version = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    output = ROOT / 'versions' / version
    output.mkdir(parents=True)
    hashes = {}
    for name, records in [('teams', teams), ('players', players), ('games', games), ('player_games', stats)]:
        records.sort(key=lambda r: (r.get('game_date', ''), str(r.get('id', r.get('game_id', ''))), r.get('player_id', 0)))
        path = output / f'{name}.csv'
        with path.open('w', newline='') as stream:
            writer = csv.DictWriter(stream, fieldnames=list(records[0]))
            writer.writeheader()
            writer.writerows(records)
        hashes[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
    metadata = {'season': SEASON, 'season_type': 'Regular Season',
                'created_at': datetime.now(timezone.utc).isoformat(),
                'source': 'NBA.com via nba_api 1.10.2', 'attribution': 'Statistics source: NBA.com',
                'usage': 'Private, noncommercial machine-learning practice; retain source notices.',
                'counts': dict(teams=len(teams), players=len(players), games=len(games), player_games=len(stats)),
                'date_min': min(g['game_date'] for g in games), 'date_max': max(g['game_date'] for g in games),
                'zero_minute_appearances': sum(s['minutes'] == 0 for s in stats),
                'minutes_precision': 'Whole minutes supplied by LeagueGameLog; not exact playing duration.',
                'position': 'Unavailable in game logs; blank means unknown.',
                'box_score_check': box_check, 'home_team_overrides_from_box_scores': overrides,
                'sha256': hashes,
                'raw_sha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(RAW.glob('*.json'))}}
    (output / 'metadata.json').write_text(json.dumps(metadata, indent=2) + '\n')
    # Only change the current-version pointer after every check and export succeeds.
    pointer = ROOT / 'CURRENT.tmp'
    pointer.write_text(f'versions/{version}\n')
    os.replace(pointer, ROOT / 'CURRENT')
    print(json.dumps({'output': str(output), 'counts': metadata['counts'],
                      'date_min': metadata['date_min'], 'date_max': metadata['date_max'],
                      'box_score_check': box_check}, indent=2), flush=True)


if __name__ == '__main__':
    main()
