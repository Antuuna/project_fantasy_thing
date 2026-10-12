-- Run against a disposable Supabase database after applying migrations.
-- All fixtures and mutations are rolled back. Requires pgTAP.
begin;
-- Linked CLI connections can begin as a restricted login role. Use the
-- project's administrative role for pgTAP and fixtures, then explicitly
-- switch to authenticated below to exercise application permissions.
set local role postgres;
create extension if not exists pgtap with schema extensions;
-- IF NOT EXISTS does not relocate an already-installed extension.
-- Discover its schema instead of assuming the project's extension layout.
do $$
declare tap_schema text;
begin
  select namespace.nspname into strict tap_schema
  from pg_catalog.pg_extension extension
  join pg_catalog.pg_namespace namespace on namespace.oid = extension.extnamespace
  where extension.extname = 'pgtap';
  perform pg_catalog.set_config('search_path', pg_catalog.format('%I, public, extensions', tap_schema), true);
end;
$$;
select plan(18);

insert into auth.users (id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.nba_players (id, full_name)
  select n, 'Test Player ' || n from generate_series(1, 11) n;
insert into public.nba_dataset_imports (season, source, dataset_version, row_counts, date_min, date_max)
  values ('2025-26', 'test fixture', 'test-fixture', '{}', '2025-10-21', '2026-04-12');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
select lives_ok('select public.ensure_roster()', 'Roster initializes');
select lives_ok('select public.ensure_roster()', 'Repeated initialization succeeds');
select is((select count(*) from public.rosters), 1::bigint, 'One roster per user');
select lives_ok('select public.add_roster_player(n) from generate_series(1,10) n', 'Ten members accepted');
select throws_ok('select public.add_roster_player(11)', '23514', 'Roster capacity is ten players', 'Overflow rejected');
select throws_ok('select public.add_roster_player(1)', '23505', 'Player already belongs to your roster', 'Duplicate rejected');
select lives_ok($$select public.save_lineup('2025-10-21', array[1,2,3,4,5]::bigint[])$$, 'Valid lineup saves');
select is((select count(*) from public.lineup_entries), 10::bigint, 'Full roster captured');
select throws_ok($$select public.save_lineup('2025-10-21', array[1,1,3,4,5]::bigint[])$$,
  '23514', 'Choose exactly five distinct starters', 'Duplicate starters rejected');
select is((select count(*) from public.lineup_entries), 10::bigint, 'Failed save preserves lineup');
select public.remove_roster_player(1);
select is((select count(*) from public.lineup_entries), 10::bigint, 'Removal preserves saved history');
select throws_ok($$select public.save_lineup('2025-10-21', array[1,2,3,4,5]::bigint[])$$,
  '23514', 'Every starter must belong to your current roster', 'Removed starter rejected on edit');
select throws_ok($$select public.save_lineup('2025-10-20', array[2,3,4,5,6]::bigint[])$$,
  '23514', 'Date must be within the imported season', 'Out-of-season date rejected');
select throws_ok($$insert into public.roster_members (user_id, roster_id, player_id)
  select user_id, id, 11 from public.rosters$$,
  '42501', 'permission denied for table roster_members', 'Direct membership writes denied');
select throws_ok($$delete from public.lineup_entries$$,
  '42501', 'permission denied for table lineup_entries', 'Direct lineup writes denied');

select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);
select is((select count(*) from public.rosters), 0::bigint, 'Other user cannot read roster');
select is((select count(*) from public.lineup_entries), 0::bigint, 'Other user cannot read lineup');
select public.remove_roster_player(2);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
select is((select count(*) from public.roster_members), 9::bigint, 'Other user removal cannot change owner roster');
-- RESET ROLE returns to the CLI login role, which may lack pgTAP access.
set local role postgres;
select * from finish();
rollback;
