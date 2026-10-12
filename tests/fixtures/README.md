These are **synthetic** test records, not NBA observations. They exercise pagination,
an unknown position, an actual recorded zero-minute appearance, appearance-based
averages, a player appearing for two historical teams, leading-zero game IDs,
inclusive season boundaries, and an in-range date without games. Player 990099 has
no appearances and must not appear in the imported-season directory.
Player 990001 has 24 appearances so browser history pagination crosses a full
20-row page in fixture-backed CI. Expected averages are calculated from the
fixture rows rather than hardcoded rounded values.

Only on a newly created disposable local stack:

```sh
export SUPABASE_TEST_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
python scripts/testing/seed_synthetic.py
python scripts/testing/seed_synthetic.py --check
python -m unittest discover -s tests/fixtures -v
```

On a populated local stack, the insertion regression can safely run separately:
`python tests/fixtures/check_seed_rollback.py`. It inserts reserved synthetic IDs in
a single uncommitted transaction, verifies actual averages/relationships, rolls
back in `finally`, and proves shared counts and metadata are restored. It never
removes existing records or makes synthetic metadata visible to other sessions.

The seeder takes table locks, refuses any preexisting shared/private data or Auth
users, and commits only after all fixture assertions pass. It does not delete,
upsert, reset, or replace anything. A populated development stack must retain its
real dataset; do not reset it to run these fixtures. CI creates its own fresh stack.
`--check` is read-only and requires the synthetic fixture metadata and exact counts.

CI runs fixture checks instead of the real-data Python discovery suite. The real
collector/importer validation, repeat-import and rollback tests require the complete
dataset selected by `data/CURRENT` and remain a separate required local gate for
data/import changes and final MVP acceptance.
