import json
import unittest

from scripts.testing.seed_synthetic import FIXTURE, require_local_target


class SyntheticFixtureTests(unittest.TestCase):
    def test_only_explicit_loopback_database_is_accepted(self):
        approved = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
        self.assertEqual(require_local_target(approved), approved)
        for rejected in ('', 'postgresql://postgres:secret@db.example.com:54322/postgres',
                         approved + '?host=db.example.com', approved + '?port=5432',
                         approved + '#fragment', approved.replace('54322', '5432'),
                         approved.replace('/postgres', '/other'),
                         approved.replace('127.0.0.1', 'localhost')):
            with self.subTest(target=rejected), self.assertRaises(ValueError):
                require_local_target(rejected)

    def test_fixture_covers_required_historical_edges(self):
        fixture = json.loads(FIXTURE.read_text())
        self.assertIn('SYNTHETIC', fixture['label'])
        players = {row[0]: row for row in fixture['players']}
        appearing = {row[0] for row in fixture['stats']}
        self.assertEqual(len(appearing), 24)
        self.assertNotIn(990099, appearing)
        self.assertIsNone(players[990002][2])
        self.assertTrue(any(row[0] == 990002 and row[3] == 0 for row in fixture['stats']))
        self.assertEqual({row[2] for row in fixture['stats'] if row[0] == 990001}, {9901, 9902})
        self.assertGreater(sum(row[0] == 990001 for row in fixture['stats']), 20)
        games = {row[0]: row for row in fixture['games']}
        dates = [row[2] for row in fixture['games']]
        self.assertEqual((min(dates), max(dates)), (fixture['date_min'], fixture['date_max']))
        self.assertTrue(fixture['date_min'] < fixture['no_game_date'] < fixture['date_max'])
        self.assertNotIn(fixture['no_game_date'], dates)
        for row in fixture['stats']:
            self.assertIn(row[0], players)
            self.assertRegex(row[1], r'^00225\d{5}$')
            self.assertIn(row[2], games[row[1]][3:5])


if __name__ == '__main__':
    unittest.main()
