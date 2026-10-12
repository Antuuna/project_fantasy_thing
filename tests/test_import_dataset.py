"""CSV validation plus opt-in PostgreSQL transaction integration checks."""
import copy
import hashlib
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.nba import import_dataset as importer


class ImportValidationTests(unittest.TestCase):
    def test_validated_dataset_preserves_ids_null_positions_and_zero_minutes(self):
        _, metadata, tables = importer.load_dataset()
        self.assertEqual(metadata['counts']['player_games'], 26651)
        self.assertEqual(tables['games'][0]['id'], '0022500001')
        self.assertTrue(all(p['position'] is None for p in tables['players']))
        self.assertEqual(sum(r['minutes'] == 0 for r in tables['player_games']), 83)

    def changed_dataset(self, name, change, rehash=True):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        version, _, _ = importer.load_dataset()
        destination = root / 'versions' / version
        destination.mkdir(parents=True)
        original = importer.ROOT / 'versions' / version
        for path in original.glob('*'):
            if path.is_file():
                (destination / path.name).write_bytes(path.read_bytes())
        (root / 'CURRENT').write_text('versions/' + version)
        path = destination / name
        path.write_text(change(path.read_text()))
        if rehash:
            metadata_path = destination / 'metadata.json'
            metadata = json.loads(metadata_path.read_text())
            metadata['sha256'][name] = hashlib.sha256(path.read_bytes()).hexdigest()
            metadata_path.write_text(json.dumps(metadata))
        return root

    def test_corrupt_csv_rejected_before_database_access(self):
        root = self.changed_dataset('teams.csv', lambda s: s + '\n', False)
        with self.assertRaisesRegex(ValueError, 'checksum'):
            importer.load_dataset(root)

    def test_missing_stat_rejected(self):
        root = self.changed_dataset('player_games.csv', lambda s: s.replace(',47,23,', ',47,,', 1))
        with self.assertRaisesRegex(ValueError, 'integer'):
            importer.load_dataset(root)

    def test_historical_team_mismatch_rejected(self):
        root = self.changed_dataset('player_games.csv', lambda s: s.replace(',1610612745,1610612760,0,47,', ',1610612737,1610612760,0,47,', 1))
        with self.assertRaisesRegex(ValueError, 'Historical team'):
            importer.load_dataset(root)

    def test_duplicate_keys_rejected(self):
        root = self.changed_dataset('players.csv', lambda s: '\n'.join([s.splitlines()[0], s.splitlines()[1], s.splitlines()[1]] + s.splitlines()[3:]) + '\n')
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            importer.load_dataset(root)


@unittest.skipUnless(os.environ.get('SUPABASE_TEST_DB_URL'), 'Set SUPABASE_TEST_DB_URL to a disposable migrated database')
class ImportDatabaseTests(unittest.TestCase):
    def test_repeat_and_failed_refresh_are_atomic(self):
        import psycopg
        from scripts.testing.seed_synthetic import require_local_target
        version, metadata, tables = importer.load_dataset()
        target = require_local_target(os.environ['SUPABASE_TEST_DB_URL'])
        with psycopg.connect(target, hostaddr='127.0.0.1', connect_timeout=5, autocommit=True) as connection:
            # Entire test rolls back, including successful imports.
            with connection.transaction(force_rollback=True):
                importer.publish(connection, version, metadata, tables)
                importer.publish(connection, version, metadata, tables)
                with connection.cursor() as cursor:
                    cursor.execute('select count(*) from public.nba_dataset_imports where dataset_version = %s', (version,))
                    self.assertEqual(cursor.fetchone()[0], 1)
                    cursor.execute('select full_name from public.nba_players where id = %s', (tables['players'][0]['id'],))
                    before = cursor.fetchone()
                    cursor.execute('select completed_at from public.nba_dataset_imports where dataset_version = %s', (version,))
                    before_metadata = cursor.fetchone()
                changed = copy.deepcopy(tables)
                changed['players'][0]['full_name'] = 'Failed refresh sentinel'
                changed['player_games'][0]['team_id'] = -1
                with self.assertRaises(psycopg.errors.ForeignKeyViolation):
                    with connection.transaction():
                        importer.publish(connection, version, metadata, changed)
                with connection.cursor() as cursor:
                    cursor.execute('select full_name from public.nba_players where id = %s', (tables['players'][0]['id'],))
                    self.assertEqual(cursor.fetchone(), before)
                    cursor.execute('select completed_at from public.nba_dataset_imports where dataset_version = %s', (version,))
                    self.assertEqual(cursor.fetchone(), before_metadata)


if __name__ == '__main__':
    unittest.main()
