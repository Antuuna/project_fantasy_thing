"""Real overlapping authenticated transactions against the approved local stack.

The first RPC completes but retains its transaction lock. A separate connection
starts the competing RPC; PostgreSQL must report that it is blocked by the first
backend before that transaction commits. No sleep or scheduling assumption counts
as evidence of a race. Every test has unique disposable accounts and players.
"""
import json
from pathlib import Path
import sys
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts.testing.local_db import connect_local_db


class ConcurrentMutations(unittest.TestCase):
    def setUp(self):
        self.user = uuid4()
        self.players = [-int(uuid4().int % (10**15)) - index for index in range(12)]
        self.addCleanup(self.cleanup)
        with connect_local_db() as connection:
            connection.execute("insert into auth.users(id, email) values (%s, %s)",
                               (self.user, "race-%s@example.com" % self.user))
            for player in self.players:
                connection.execute("insert into public.nba_players(id, full_name) values (%s, %s)",
                                   (player, "Synthetic race player"))
            row = connection.execute(
                "select date_min from public.nba_dataset_imports "
                "order by completed_at desc, id desc limit 1").fetchone()
            if not row:
                self.fail("Concurrency suite requires successful local import metadata.")
            self.date = row[0]

    def cleanup(self):
        with connect_local_db() as connection:
            connection.execute("delete from auth.users where id = %s", (self.user,))
            connection.execute("delete from public.nba_players where id = any(%s)", (self.players,))

    def authenticate(self, connection):
        connection.execute("select set_config('request.jwt.claims', %s, true)",
                           (json.dumps({"sub": str(self.user), "role": "authenticated"}),))
        connection.execute("set local role authenticated")

    def rpc(self, sql, params=()):
        with connect_local_db() as connection:
            self.authenticate(connection)
            return connection.execute(sql, params).fetchone()

    def populate(self, count):
        self.rpc("select public.ensure_roster()")
        for player in self.players[:count]:
            self.rpc("select public.add_roster_player(%s)", (player,))

    def members(self):
        with connect_local_db() as connection:
            return {row[0] for row in connection.execute(
                "select player_id from public.roster_members where user_id = %s", (self.user,))}

    def snapshot(self):
        with connect_local_db() as connection:
            return dict(connection.execute(
                "select player_id, slot from public.lineup_entries "
                "where user_id = %s and lineup_date = %s", (self.user, self.date)).fetchall())

    def complete_snapshot(self):
        with connect_local_db() as connection:
            return connection.execute(
                "select * from public.lineup_entries where user_id = %s "
                "and lineup_date = %s order by player_id", (self.user, self.date)).fetchall()

    def expected(self, members, starters):
        return {player: ("starter_%s" % (starters.index(player) + 1)
                         if player in starters else "bench") for player in members}

    def overlap(self, first_sql, first_params, second_sql, second_params):
        """Return first result and second result/error after proving lock overlap."""
        barrier = threading.Barrier(2, timeout=3)
        with connect_local_db() as first, connect_local_db() as second, \
                connect_local_db(autocommit=True) as observer, ThreadPoolExecutor(max_workers=1) as pool:
            self.authenticate(first)
            self.authenticate(second)
            first_pid, second_pid = first.info.backend_pid, second.info.backend_pid
            self.assertNotEqual(first_pid, second_pid)
            first_result = first.execute(first_sql, first_params).fetchone()

            def contender():
                barrier.wait()
                try:
                    result = second.execute(second_sql, second_params).fetchone()
                    second.commit()
                    return result
                except psycopg.Error as error:
                    second.rollback()
                    return error.sqlstate

            pending = pool.submit(contender)
            try:
                barrier.wait()
                deadline = time.monotonic() + 3
                observed = False
                while time.monotonic() < deadline:
                    row = observer.execute(
                        "select %s = any(pg_blocking_pids(pid)), wait_event_type "
                        "from pg_stat_activity where pid = %s", (first_pid, second_pid)).fetchone()
                    if row and row[0] and row[1] == "Lock":
                        observed = True
                        break
                    if pending.done():
                        break
                self.assertTrue(observed, "Competing RPC never demonstrably blocked on the first transaction")
                first.commit()
                second_result = pending.result(timeout=6)
            finally:
                # Release the first lock even if overlap verification fails.
                first.rollback()
            return first_result, second_result

    def test_nine_members_two_distinct_additions(self):
        self.populate(9)
        _, second = self.overlap("select public.add_roster_player(%s)", (self.players[9],),
                                 "select public.add_roster_player(%s)", (self.players[10],))
        self.assertEqual(second, "23514")
        self.assertEqual(self.members(), set(self.players[:10]))

    def test_duplicate_simultaneous_additions(self):
        self.populate(0)
        _, second = self.overlap("select public.add_roster_player(%s)", (self.players[0],),
                                 "select public.add_roster_player(%s)", (self.players[0],))
        self.assertEqual(second, "23505")
        self.assertEqual(self.members(), {self.players[0]})

    def test_two_lineup_replacements_are_complete_ordered_snapshots(self):
        self.populate(7)
        starters_a = self.players[:5]
        starters_b = list(reversed(self.players[2:7]))
        _, second = self.overlap("select public.save_lineup(%s, %s::bigint[])", (self.date, starters_a),
                                 "select public.save_lineup(%s, %s::bigint[])", (self.date, starters_b))
        self.assertEqual(second, ("",))
        self.assertEqual(self.snapshot(), self.expected(self.players[:7], starters_b))

    def test_save_then_remove_retains_historical_starter(self):
        self.populate(6)
        starters = self.players[:5]
        _, second = self.overlap("select public.save_lineup(%s, %s::bigint[])", (self.date, starters),
                                 "select public.remove_roster_player(%s)", (starters[0],))
        self.assertEqual(second, ("",))
        self.assertEqual(self.snapshot(), self.expected(self.players[:6], starters))
        self.assertEqual(self.members(), set(self.players[1:6]))

    def test_remove_then_save_rejects_starter_and_preserves_previous_snapshot(self):
        self.populate(6)
        starters = self.players[:5]
        self.rpc("select public.save_lineup(%s, %s::bigint[])", (self.date, starters))
        previous = self.complete_snapshot()
        _, second = self.overlap("select public.remove_roster_player(%s)", (starters[0],),
                                 "select public.save_lineup(%s, %s::bigint[])", (self.date, starters))
        self.assertEqual(second, "23514")
        self.assertEqual(self.complete_snapshot(), previous)
        self.assertEqual(self.members(), set(self.players[1:6]))

    def test_save_then_add_does_not_change_saved_bench(self):
        self.populate(6)
        starters = self.players[:5]
        _, second = self.overlap("select public.save_lineup(%s, %s::bigint[])", (self.date, starters),
                                 "select public.add_roster_player(%s)", (self.players[6],))
        self.assertEqual(second, ("",))
        self.assertEqual(self.snapshot(), self.expected(self.players[:6], starters))
        self.assertEqual(self.members(), set(self.players[:7]))

    def test_add_then_save_includes_new_bench_member(self):
        self.populate(6)
        starters = self.players[:5]
        _, second = self.overlap("select public.add_roster_player(%s)", (self.players[6],),
                                 "select public.save_lineup(%s, %s::bigint[])", (self.date, starters))
        self.assertEqual(second, ("",))
        self.assertEqual(self.snapshot(), self.expected(self.players[:7], starters))
        self.assertEqual(self.members(), set(self.players[:7]))

    def test_simultaneous_initialization_reuses_one_uuid(self):
        first, second = self.overlap("select public.ensure_roster()", (),
                                     "select public.ensure_roster()", ())
        self.assertEqual(first, second)
        self.assertEqual(first, self.rpc("select public.ensure_roster()"))
        with connect_local_db() as connection:
            rows = connection.execute("select id from public.rosters where user_id = %s", (self.user,)).fetchall()
        self.assertEqual(rows, [first])
        self.assertIsInstance(first[0], type(uuid4()))


if __name__ == "__main__":
    unittest.main()
