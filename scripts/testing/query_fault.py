"""Targeted local-only read fault for one disposable test account; always clean up."""
import sys
from uuid import UUID
from psycopg import sql
from local_db import connect_local_db

user = UUID(sys.argv[1])
mode = sys.argv[2]
policy = 'test_metadata_' + user.hex
function = 'test_failure_' + user.hex
with connect_local_db() as connection:
    connection.execute(sql.SQL('drop policy if exists {} on public.nba_dataset_imports').format(sql.Identifier(policy)))
    connection.execute(sql.SQL('drop function if exists public.{}()').format(sql.Identifier(function)))
    if mode == 'empty':
        expression = sql.SQL('auth.uid() <> {}::uuid').format(sql.Literal(str(user)))
    elif mode == 'failure':
        connection.execute(sql.SQL("create function public.{}() returns boolean language plpgsql as $$ begin raise exception 'Controlled local query failure'; end $$").format(sql.Identifier(function)))
        expression = sql.SQL('case when auth.uid() = {}::uuid then public.{}() else true end').format(sql.Literal(str(user)), sql.Identifier(function))
    elif mode != 'clean':
        raise ValueError('Unknown local fault mode')
    if mode != 'clean':
        connection.execute(sql.SQL('create policy {} on public.nba_dataset_imports as restrictive for select to authenticated using ({})').format(sql.Identifier(policy), expression))
