"""Required full-data gate; no skips and no hosted target fallback."""
import os
import unittest

os.environ['SUPABASE_TEST_DB_URL'] = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
suite = unittest.defaultTestLoader.discover('tests', pattern='test_*.py')
result = unittest.TextTestRunner(verbosity=2).run(suite)
raise SystemExit(0 if result.wasSuccessful() and not result.skipped and result.testsRun >= 12 else 1)
