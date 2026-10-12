"""Integrity tests use the actual local raw dataset; no network requests."""
import copy
import csv
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.nba import collect


class DatasetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = collect.RAW
        if not (collect.ROOT / 'CURRENT').exists():
            raise unittest.SkipTest('Collect the local dataset first')
        cls.version = collect.ROOT / (collect.ROOT / 'CURRENT').read_text().strip()
        cls.metadata = json.loads((cls.version / 'metadata.json').read_text())
        cls.team_payload = json.loads((cls.raw / 'league_game_log_2025-26_T.json').read_text())
        cls.player_payload = json.loads((cls.raw / 'league_game_log_2025-26_P.json').read_text())
        cls.team_rows = collect.rows(cls.team_payload)
        cls.player_rows = collect.rows(cls.player_payload)
        cls.overrides = cls.metadata['home_team_overrides_from_box_scores']

    def normalize(self, player_rows):
        return collect.normalize(self.team_rows, player_rows, self.overrides)

    def test_csv_hashes_counts_and_references(self):
        tables = {}
        for name, checksum in self.metadata['sha256'].items():
            path = self.version / name
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), checksum)
            with path.open(newline='') as stream:
                tables[path.stem] = list(csv.DictReader(stream))
            self.assertEqual(len(tables[path.stem]), self.metadata['counts'][path.stem])
        teams = {r['id'] for r in tables['teams']}
        players = {r['id'] for r in tables['players']}
        games = {r['id']: r for r in tables['games']}
        self.assertEqual(len(games), 1230)
        keys = set()
        for r in tables['player_games']:
            key = r['player_id'], r['game_id']
            self.assertNotIn(key, keys)
            keys.add(key)
            self.assertIn(r['player_id'], players)
            self.assertIn(r['team_id'], teams)
            game = games[r['game_id']]
            self.assertEqual(r['game_date'], game['game_date'])
            self.assertIn(r['team_id'], (game['home_team_id'], game['away_team_id']))
            self.assertEqual(r['is_home'], str(int(r['team_id'] == game['home_team_id'])))
            self.assertRegex(r['game_id'], r'^00225\d{5}$')

    def test_duplicate_appearance_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Duplicate player/game'):
            self.normalize(self.player_rows + [self.player_rows[0]])

    def test_missing_stat_not_replaced_with_zero(self):
        changed = [dict(self.player_rows[0], PTS=None)] + self.player_rows[1:]
        with self.assertRaisesRegex(ValueError, 'Invalid/missing PTS'):
            self.normalize(changed)

    def test_wrong_historical_team_rejected(self):
        changed = [dict(self.player_rows[0], TEAM_ID=1)] + self.player_rows[1:]
        with self.assertRaisesRegex(ValueError, 'foreign key'):
            self.normalize(changed)

    def test_numeric_game_id_rejected(self):
        with self.assertRaisesRegex(ValueError, 'game ID'):
            collect.identity(dict(self.player_rows[0], GAME_ID=225000001))

    def test_failed_refresh_preserves_previous_dataset(self):
        broken = copy.deepcopy(self.player_payload)
        result = broken['resultSets'][0]
        result['rowSet'][0][result['headers'].index('PTS')] = None
        def cached(name, factory):
            if name.endswith('_T.json'):
                return self.team_payload
            if name.endswith('_P.json'):
                return broken
            return json.loads((self.raw / name).read_text())
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'CURRENT').write_text('versions/previous\n')
            previous = root / 'versions/previous'
            previous.mkdir(parents=True)
            (previous / 'sentinel.csv').write_text('previous usable data\n')
            with patch.object(collect, 'ROOT', root), patch.object(collect, 'fetch', cached):
                with self.assertRaisesRegex(ValueError, 'Invalid/missing PTS'):
                    collect.main()
            self.assertEqual((root / 'CURRENT').read_text(), 'versions/previous\n')
            self.assertEqual((previous / 'sentinel.csv').read_text(), 'previous usable data\n')


if __name__ == '__main__':
    unittest.main()
