"""Run rollback-only pgTAP assertions against the approved local Supabase stack.

Usage: .venv/bin/python scripts/testing/run_database.py
       .venv/bin/python scripts/testing/run_database.py --self-test
"""

import re
import sys
import unittest
from pathlib import Path

import psycopg
from psycopg.pq import TransactionStatus

try:
    from .local_db import connect_local_db
except ImportError:
    from local_db import connect_local_db


class TapError(ValueError):
    pass


class TapReport:
    """Enforce successful numbered assertions, one plan, and explicit finish()."""

    def __init__(self):
        self.plan = None
        self.count = 0
        self.finished = False

    def consume(self, value):
        for line in str(value).splitlines():
            line = line.strip()
            if not line:
                continue
            if line.startswith("Bail out!") or line.startswith("not ok"):
                raise TapError("pgTAP assertion failed: " + line)
            if line.startswith("#"):
                continue
            plan = re.fullmatch(r"1\.\.(\d+)", line)
            if plan:
                if self.plan is not None:
                    raise TapError("pgTAP emitted multiple plans")
                self.plan = int(plan.group(1))
                if self.plan < 18:
                    raise TapError("pgTAP must enforce at least the initial 18 assertions")
                continue
            assertion = re.fullmatch(r"ok (\d+)(?:\s+-?\s*.*)?", line)
            if assertion:
                if re.search(r"#\s*(?:SKIP|TODO)\b", line, re.IGNORECASE):
                    raise TapError("Required pgTAP assertions cannot be skipped or TODO")
                number = int(assertion.group(1))
                if number != self.count + 1:
                    raise TapError("pgTAP assertion numbering is incomplete or duplicated")
                self.count += 1
                continue
            raise TapError("Unexpected pgTAP output: " + line)

    def validate(self):
        if self.plan is None or self.count != self.plan:
            raise TapError("pgTAP plan mismatch: planned %s, observed %s" % (self.plan, self.count))
        if not self.finished:
            raise TapError("pgTAP finish() did not complete")


def run_database():
    sql_path = Path(__file__).resolve().parents[2] / "supabase/tests/roster_planner.sql"
    report = TapReport()
    rollback_seen = False
    with connect_local_db(autocommit=True) as connection:
        try:
            with connection.cursor() as cursor:
                cursor.execute(sql_path.read_text())
                while True:
                    if cursor.description:
                        names = [column.name for column in cursor.description]
                        rows = cursor.fetchall()
                        # Only pgTAP function results belong to the TAP stream.
                        if len(names) == 1 and names[0] in {
                            "plan", "is", "ok", "isnt", "lives_ok", "throws_ok",
                            "finish", "results_eq", "cmp_ok", "pass", "fail",
                            "throws_like", "throws_matching",
                        }:
                            for row in rows:
                                print(row[0])
                                report.consume(row[0])
                            if names[0] == "finish":
                                report.finished = True
                    if cursor.statusmessage == "ROLLBACK":
                        rollback_seen = True
                    if not cursor.nextset():
                        break
            report.validate()
            if not rollback_seen or connection.info.transaction_status != TransactionStatus.IDLE:
                raise TapError("SQL suite did not complete its fixture rollback")
        finally:
            # Also clear fixtures if SQL or parsing fails before its final rollback.
            connection.rollback()
    print("PASS: %s pgTAP assertions; finish completed; fixtures rolled back." % report.count)


class TapParserTests(unittest.TestCase):
    def report(self, count=18, plan="1..18", finished=True):
        report = TapReport()
        report.consume(plan)
        for number in range(1, count + 1):
            report.consume("ok %s - assertion" % number)
        report.finished = finished
        return report

    def test_complete(self):
        self.report().validate()

    def test_failure(self):
        with self.assertRaises(TapError):
            self.report().consume("not ok 19 - broken")

    def test_plan_mismatch(self):
        with self.assertRaises(TapError):
            self.report(count=17).validate()

    def test_missing_finish(self):
        with self.assertRaises(TapError):
            self.report(finished=False).validate()

    def test_bailout(self):
        with self.assertRaises(TapError):
            self.report().consume("Bail out! missing fixture")

    def test_skipped_assertion(self):
        with self.assertRaises(TapError):
            self.report().consume("ok 19 # SKIP missing service")

    def test_duplicate_plan(self):
        with self.assertRaises(TapError):
            self.report().consume("1..18")

    def test_missing_number(self):
        with self.assertRaises(TapError):
            self.report().consume("ok 20 - incomplete")

    def test_weakened_plan(self):
        with self.assertRaises(TapError):
            self.report(plan="1..0 # SKIP unavailable")

    def test_finish_diagnostic(self):
        # finish() reports incomplete plans as diagnostics; count still rejects them.
        report = self.report(count=17)
        report.consume("# Looks like you planned 18 tests but ran 17")
        with self.assertRaises(TapError):
            report.validate()


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        unittest.main(argv=[sys.argv[0]])
    elif sys.argv[1:]:
        raise SystemExit("Usage: run_database.py [--self-test]")
    else:
        try:
            run_database()
        except (psycopg.Error, TapError, OSError) as error:
            # Avoid database errors/DSNs containing credentials or arbitrary SQL text.
            if isinstance(error, TapError):
                print("FAIL: " + str(error), file=sys.stderr)
            else:
                print("FAIL: local PostgreSQL unavailable or SQL suite failed (%s); "
                      "start the local Supabase stack and apply migrations." % type(error).__name__,
                      file=sys.stderr)
            raise SystemExit(1)
