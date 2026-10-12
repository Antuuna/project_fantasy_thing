"""Save a bounded real NBA response; stop on access failures."""
import json
import time
from pathlib import Path

from nba_api.stats.endpoints.leaguegamelog import LeagueGameLog
from requests.exceptions import RequestException

root = Path('data/raw')
root.mkdir(parents=True, exist_ok=True)
for mode in ('T', 'P'):
    for attempt in range(2):
        try:
            endpoint = LeagueGameLog(
                season='2025-26', season_type_all_star='Regular Season',
                player_or_team_abbreviation=mode,
                date_from_nullable='10/21/2025', date_to_nullable='10/23/2025',
                timeout=20,
            )
            raw = endpoint.get_json()
            (root / f'sample_{mode}.json').write_text(raw)
            dataset = json.loads(raw)['resultSets'][0]
            print(json.dumps({'mode': mode, 'headers': dataset['headers'],
                              'count': len(dataset['rowSet']),
                              'first_rows': dataset['rowSet'][:2]}), flush=True)
            break
        except RequestException as exc:
            print(f'{mode} attempt {attempt + 1}: {type(exc).__name__}: {exc}', flush=True)
            if attempt == 1:
                raise SystemExit('NBA access failed; no dataset created.')
            time.sleep(5)
    time.sleep(3)
