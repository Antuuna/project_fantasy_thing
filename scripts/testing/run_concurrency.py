"""Fail-closed entry point for the independent-transaction suite added in M1."""
import unittest

suite = unittest.defaultTestLoader.discover('tests/database', pattern='test_concurrency.py')
result = unittest.TextTestRunner(verbosity=2).run(suite)
raise SystemExit(0 if result.wasSuccessful() and result.testsRun and not result.skipped else 1)
