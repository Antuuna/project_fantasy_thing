"""Exercise actual inserts on the local full DB, always rolling back this transaction.

Unlike the CLI seeder this internal test can coexist with the real dataset: every
insert has a reserved synthetic ID, and metadata/inserts never become committed.
"""
import json
import os
import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts.testing.seed_synthetic import FIXTURE, insert_fixture, require_local_target


def main():
    import psycopg
    fixture = json.loads(FIXTURE.read_text())
    target = require_local_target(os.environ.get('SUPABASE_TEST_DB_URL', ''))
    with psycopg.connect(target, hostaddr='127.0.0.1', connect_timeout=5) as conn:
        try:
            conn.execute("set local lock_timeout = '5s'")
            before = conn.execute('select count(*) from public.nba_players').fetchone()[0]
            insert_fixture(conn, fixture)
            count = conn.execute('select count(*) from public.nba_players').fetchone()[0]
            assert count == before + len(fixture['players']), 'all fixture players inserted'
            for player in (990001, 990002):
                appearances = [row for row in fixture['stats'] if row[0] == player]
                expected = sum(Decimal(row[4]) for row in appearances) / len(appearances)
                row = conn.execute('select appearances, points from public.nba_player_season_averages '
                                   'where player_id=%s and season=%s', (player, fixture['season'])).fetchone()
                assert row[0] == len(appearances), 'actual appearance denominator'
                assert abs(row[1] - expected) < Decimal('0.000000001'), 'actual unrounded point average'
            teams = conn.execute('select distinct team_id from public.nba_player_game_stats '
                                 'where player_id=990001 order by team_id').fetchall()
            assert teams == [(9901,), (9902,)], 'actual historical traded teams'
            assert conn.execute('select minutes from public.nba_player_game_stats '
                                "where player_id=990002 and game_id='0022599001'").fetchone()[0] == 0
            assert conn.execute("select position from public.nba_players where id=990002").fetchone()[0] is None
            assert conn.execute('select count(*) from public.nba_dataset_imports where dataset_version=%s',
                                (fixture['version'],)).fetchone()[0] == 1
        finally:
            conn.rollback()
        assert conn.execute('select count(*) from public.nba_players').fetchone()[0] == before
        assert conn.execute('select count(*) from public.nba_dataset_imports where dataset_version=%s',
                            (fixture['version'],)).fetchone()[0] == 0
    print('11 rollback-only synthetic insertion assertions passed; existing dataset preserved')


if __name__ == '__main__':
    main()
