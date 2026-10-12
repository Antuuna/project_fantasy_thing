"""The explicitly approved local Supabase database; never read hosted env values."""

import psycopg


def connect_local_db(*, autocommit=False):
    """Connect only to the standard local stack, with bounded waits."""
    return psycopg.connect(
        host="127.0.0.1",
        hostaddr="127.0.0.1",
        port=54322,
        dbname="postgres",
        user="postgres",
        password="postgres",
        connect_timeout=5,
        options="-c statement_timeout=30000 -c lock_timeout=5000",
        autocommit=autocommit,
    )
