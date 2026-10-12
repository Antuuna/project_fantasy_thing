-- Synthetic query semantics only; does not replace full-data acceptance.
begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
do $$ declare tap_schema text; begin
 select n.nspname into strict tap_schema from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgtap';
 perform set_config('search_path',format('%I, public, extensions',tap_schema),true);
end $$;
create temporary table query_user(id uuid default gen_random_uuid());
insert into query_user default values;
insert into auth.users(id) select id from query_user;
grant select on query_user to authenticated;
insert into nba_teams(id,name,abbreviation) values(-820000000001,'Historical A','HAA'),(-820000000002,'Historical B','HBB');
insert into nba_players(id,full_name,position)
 select -820000000000-n,case when n<=25 then 'Same Query Fixture Name' else 'No Selected Appearance' end,null from generate_series(1,27)n;
insert into nba_games(id,season,game_date,home_team_id,away_team_id,home_points,away_points)
 select '0999998'||lpad(n::text,3,'0'),'query-fixture','1901-01-01'::date+n-1,
 case when n=3 then -820000000002 else -820000000001 end,
 case when n=3 then -820000000001 else -820000000002 end,10,20 from generate_series(1,22)n;
insert into nba_games(id,season,game_date,home_team_id,away_team_id,home_points,away_points)
 values('0999998999','other-fixture','1900-01-01',-820000000001,-820000000002,10,20);
-- The first player has three appearances, including zero minutes and a historical trade.
insert into nba_player_game_stats(player_id,game_id,team_id,minutes,points,rebounds,assists,steals,blocks,turnovers)
 values(-820000000001,'0999998001',-820000000001,0,0,0,0,0,0,0),
 (-820000000001,'0999998002',-820000000002,10,5,1,2,1,2,1),
 (-820000000001,'0999998003',-820000000002,20,5,2,4,2,4,2),
 (-820000000001,'0999998999',-820000000001,99,99,99,99,99,99,99),
 (-820000000026,'0999998999',-820000000001,99,99,99,99,99,99,99);
-- More than one history page; no unbounded full-history request is required.
insert into nba_player_game_stats(player_id,game_id,team_id,minutes,points,rebounds,assists,steals,blocks,turnovers)
 select -820000000002,'0999998'||lpad(n::text,3,'0'),case when n=3 then -820000000002 else -820000000001 end,1,1,1,1,1,1,1 from generate_series(1,22)n;
insert into nba_player_game_stats(player_id,game_id,team_id,minutes,points,rebounds,assists,steals,blocks,turnovers)
 select -820000000000-n,'0999998001',-820000000001,1,1,1,1,1,1,1 from generate_series(3,25)n;
insert into nba_dataset_imports(season,completed_at,source,dataset_version,row_counts,date_min,date_max)
 values('query-fixture','9998-01-01','synthetic pgTAP',gen_random_uuid()::text,'{}','1901-01-01','1901-01-22');
create function pg_temp.query_state(query text) returns text language plpgsql as $$
begin execute query; return '00000'; exception when others then return sqlstate; end $$;
select plan(43);
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from query_user),true);
select is((select count(*) from nba_season_players where season='query-fixture'), 25::bigint, 'Directory includes only selected-season appearance players');
select is((select count(*) from nba_season_players where season='query-fixture' and id in(-820000000026,-820000000027)), 0::bigint, 'Old-season-only and never-appeared identities excluded');
select is((select appearances from nba_season_players where season='query-fixture' and id=-820000000001), 3::bigint, 'Zero-minute appearance contributes to denominator');
select is((select minutes from nba_season_players where season='query-fixture' and id=-820000000001), 10::numeric, 'Appearance-based unrounded minutes average');
select is((select points from nba_season_players where season='query-fixture' and id=-820000000001), 10::numeric/3, 'Appearance-based unrounded points average');
select is((select rebounds from nba_season_players where season='query-fixture' and id=-820000000001), 1::numeric, 'Appearance-based unrounded rebounds average');
select is((select assists from nba_season_players where season='query-fixture' and id=-820000000001), 2::numeric, 'Appearance-based unrounded assists average');
select is((select steals from nba_season_players where season='query-fixture' and id=-820000000001), 1::numeric, 'Appearance-based unrounded steals average');
select is((select blocks from nba_season_players where season='query-fixture' and id=-820000000001), 2::numeric, 'Appearance-based unrounded blocks average');
select is((select turnovers from nba_season_players where season='query-fixture' and id=-820000000001), 1::numeric, 'Appearance-based unrounded turnovers average');
select ok((select position is null from nba_season_players where season='query-fixture' and id=-820000000001), 'Unknown position preserved honestly');
select is((select full_name from nba_season_players where season='query-fixture' and id=-820000000001), 'Same Query Fixture Name', 'Player identity joined in bounded directory view');
select is((select count(*) from (select * from nba_season_players where season='query-fixture' order by full_name,id limit 21) bounded), 21::bigint, 'Directory lookahead fetch is bounded to twenty plus one');
select is((select array_agg(id order by id) from (select * from nba_season_players where season='query-fixture' order by full_name,id limit 20) page), (select array_agg(n order by n) from generate_series(-820000000025::bigint,-820000000006::bigint)n), 'First directory page stable with equal names');
select is((select array_agg(id order by id) from (select * from nba_season_players where season='query-fixture' order by full_name,id limit 20 offset 20) page), (select array_agg(n order by n) from generate_series(-820000000005::bigint,-820000000001::bigint)n), 'Second directory page complete with no duplicate identities');
select is((select count(*) from (select * from nba_season_players where season='query-fixture' order by full_name,id limit 21 offset 100) page), 0::bigint, 'Directory out-of-range page is empty');
select is((select count(*) from nba_season_players where season='query-fixture' and full_name ilike '%Same Query%'), 25::bigint, 'Season name search matches fixture players');
select is((select count(*) from nba_season_players where season='query-fixture' and full_name ilike '%absent literal%'), 0::bigint, 'Search empty state has no fabricated results');
select is((select count(*) from (select * from nba_player_history where player_id=-820000000002 and season='query-fixture' order by game_date desc,game_id desc limit 21) bounded), 21::bigint, 'History lookahead fetch bounded to twenty plus one');
select is((select game_id from (select * from nba_player_history where player_id=-820000000002 and season='query-fixture' order by game_date desc,game_id desc limit 1) newest), '0999998022', 'History newest date first preserves leading zero text ID');
select is((select game_id from (select * from nba_player_history where player_id=-820000000002 and season='query-fixture' order by game_date desc,game_id desc limit 1 offset 20) next_page), '0999998002', 'Second history page starts after first twenty records');
select is((select count(*) from (select * from nba_player_history where player_id=-820000000002 and season='query-fixture' order by game_date desc,game_id desc limit 20 offset 20) next_page), 2::bigint, 'Second history page contains remaining records');
select is((select count(*) from nba_player_history where player_id=-820000000001 and season='query-fixture'), 3::bigint, 'History season filter excludes other-season appearances');
select is((select count(distinct team_id) from nba_player_history where player_id=-820000000001 and season='query-fixture'), 2::bigint, 'Historical trade retains two per-game teams');
select is((select team_name from nba_player_history where player_id=-820000000001 and game_id='0999998001'), 'Historical A', 'Before-trade team');
select is((select opponent_name from nba_player_history where player_id=-820000000001 and game_id='0999998001'), 'Historical B', 'Before-trade opponent');
select is((select team_name from nba_player_history where player_id=-820000000001 and game_id='0999998002'), 'Historical B', 'After-trade team');
select is((select opponent_name from nba_player_history where player_id=-820000000001 and game_id='0999998002'), 'Historical A', 'After-trade opponent');
select is((select is_home from nba_player_history where player_id=-820000000001 and game_id='0999998002'), false, 'Away appearance remains away');
select is((select is_home from nba_player_history where player_id=-820000000001 and game_id='0999998003'), true, 'Home appearance remains home');
select is((select minutes from nba_player_history where player_id=-820000000001 and game_id='0999998001'), 0::numeric, 'Zero-minute history preserved');
select is((select reloptions @> array['security_invoker=true'] from pg_class where oid='public.nba_season_players'::regclass), true, 'Invoker security retained nba_season_players');
select is(has_table_privilege('authenticated','public.nba_season_players','INSERT'), false, 'Ordinary INSERT grant absent nba_season_players');
select is(has_table_privilege('authenticated','public.nba_season_players','UPDATE'), false, 'Ordinary UPDATE grant absent nba_season_players');
select is(has_table_privilege('authenticated','public.nba_season_players','DELETE'), false, 'Ordinary DELETE grant absent nba_season_players');
select is(pg_temp.query_state('delete from public.nba_season_players'), '55000', 'Aggregate/join view rejects direct delete nba_season_players');
select is((select reloptions @> array['security_invoker=true'] from pg_class where oid='public.nba_player_history'::regclass), true, 'Invoker security retained nba_player_history');
select is(has_table_privilege('authenticated','public.nba_player_history','INSERT'), false, 'Ordinary INSERT grant absent nba_player_history');
select is(has_table_privilege('authenticated','public.nba_player_history','UPDATE'), false, 'Ordinary UPDATE grant absent nba_player_history');
select is(has_table_privilege('authenticated','public.nba_player_history','DELETE'), false, 'Ordinary DELETE grant absent nba_player_history');
select is(pg_temp.query_state('delete from public.nba_player_history'), '55000', 'Aggregate/join view rejects direct delete nba_player_history');
set local role anon; select set_config('request.jwt.claim.sub','',true);
select is(pg_temp.query_state('select * from public.nba_season_players'), '42501', 'Anonymous directory/history read denied nba_season_players');
select is(pg_temp.query_state('select * from public.nba_player_history'), '42501', 'Anonymous directory/history read denied nba_player_history');
set local role postgres;
select * from finish();
rollback;
