-- Rollback-only synthetic names prove literal LIKE semantics through the RPC.
begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
do $$ declare tap_schema text; begin
 select n.nspname into strict tap_schema from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgtap';
 perform set_config('search_path',format('%I, public, extensions',tap_schema),true);
end $$;
create temporary table literal_user(id uuid default gen_random_uuid());
insert into literal_user default values;
insert into auth.users(id) select id from literal_user;
grant select on literal_user to authenticated;
insert into nba_teams(id,name,abbreviation) values(-830000000001,'Literal A','LIA'),(-830000000002,'Literal B','LIB');
insert into nba_games(id,season,game_date,home_team_id,away_team_id,home_points,away_points)
 values('0999997001','literal-fixture','1902-01-01',-830000000001,-830000000002,1,2),
 ('0999997002','literal-other','1902-01-02',-830000000001,-830000000002,1,2);
insert into nba_players(id,full_name)
 select -830000000000-n,'Literal Plain Name' from generate_series(1,25)n;
insert into nba_players(id,full_name) values
 (-830000000026,'Literal * Star'),(-830000000027,'Literal % Percent'),
 (-830000000028,'Literal _ Under'),(-830000000029,E'Literal \\ Slash'),
 (-830000000030,E'Literal %_\\* Combo'),(-830000000031,'Literal * Old Season'),
 (-830000000032,'Literal * Never Appeared');
insert into nba_player_game_stats(player_id,game_id,team_id,minutes,points,rebounds,assists,steals,blocks,turnovers)
 select -830000000000-n,'0999997001',-830000000001,0,0,0,0,0,0,0 from generate_series(1,30)n;
insert into nba_player_game_stats(player_id,game_id,team_id,minutes,points,rebounds,assists,steals,blocks,turnovers)
 values(-830000000031,'0999997002',-830000000001,0,0,0,0,0,0,0);
create function pg_temp.literal_state(query text) returns text language plpgsql as $$
begin execute query; return '00000'; exception when others then return sqlstate; end $$;
select plan(29);
set local role authenticated; select set_config('request.jwt.claim.sub',(select id::text from literal_user),true);
select is((select count(*) from search_season_players('literal-fixture','*',0)),2::bigint,'Asterisk matches only literal star names');
select is((select count(*) from search_season_players('literal-fixture','%',0)),2::bigint,'Percent matches only literal percent names');
select is((select count(*) from search_season_players('literal-fixture','_',0)),2::bigint,'Underscore matches only literal underscore names');
select is((select count(*) from search_season_players('literal-fixture',E'\\',0)),2::bigint,'Backslash matches only literal backslash names');
select is((select count(*) from search_season_players('literal-fixture',E'%_\\*',0)),1::bigint,'Combined metacharacters remain literal');
select is((select count(*) from search_season_players('literal-fixture','literal * star',0)),1::bigint,'Name search remains case insensitive');
select is((select count(*) from search_season_players('literal-fixture','unmatched',0)),0::bigint,'Absent literal query returns empty');
select is((select id from search_season_players('literal-fixture','* Star',0)),-830000000026::bigint,'Star query selects correct identity rather than percent alias');
select is((select id from search_season_players('literal-fixture','% Percent',0)),-830000000027::bigint,'Percent query selects correct identity rather than wildcard');
select is((select count(*) from search_season_players('literal-fixture','',0)),21::bigint,'Empty search bounded to twenty plus one lookahead');
select is((select count(*) from search_season_players('literal-fixture','Plain',0)),21::bigint,'Matching search bounded to twenty plus one lookahead');
select is((select array_agg(id order by id) from (select * from search_season_players('literal-fixture','Plain',0) limit 20) page),(select array_agg(n order by n) from generate_series(-830000000025::bigint,-830000000006::bigint)n),'Stable first page orders equal names by identity');
select is((select array_agg(id order by id) from search_season_players('literal-fixture','Plain',20)),(select array_agg(n order by n) from generate_series(-830000000005::bigint,-830000000001::bigint)n),'Stable next page contains remaining identities');
select is((select count(*) from search_season_players('literal-fixture','',199980)),0::bigint,'Largest supported page offset accepted and empty');
select is((select count(*) from search_season_players('no-such-season','',0)),0::bigint,'Unknown season does not leak another season');
select is((select count(*) from search_season_players('literal-fixture','Old Season',0)),0::bigint,'Old-season appearance excluded');
select is((select count(*) from search_season_players('literal-fixture','Never Appeared',0)),0::bigint,'No-appearance identity excluded');
select is((select count(*) from search_season_players('literal-other','*',0)),1::bigint,'Explicit other season isolates its own appearance');
select is(pg_temp.literal_state($query$select search_season_players('literal-fixture',repeat('x',80),0)$query$),'00000','Eighty-character query accepted');
select is(pg_temp.literal_state($query$select search_season_players('literal-fixture',repeat('x',81),0)$query$),'22023','Invalid RPC query or offset rejected 20');
select is(pg_temp.literal_state($query$select search_season_players('literal-fixture',null,0)$query$),'22023','Invalid RPC query or offset rejected 21');
select is(pg_temp.literal_state($query$select search_season_players('literal-fixture','',-1)$query$),'22023','Invalid RPC query or offset rejected 22');
select is(pg_temp.literal_state($query$select search_season_players('literal-fixture','',199981)$query$),'22023','Invalid RPC query or offset rejected 23');
select is(pg_temp.literal_state($query$select search_season_players('literal-fixture','',null)$query$),'22023','Invalid RPC query or offset rejected 24');
select is((select prosecdef from pg_proc where oid='public.search_season_players(text,text,integer)'::regprocedure),false,'RPC executes with caller permissions');
select is((select proconfig @> array['search_path=""'] from pg_proc where oid='public.search_season_players(text,text,integer)'::regprocedure),true,'RPC fixes its search path');
select is(has_function_privilege('anon','public.search_season_players(text,text,integer)','EXECUTE'),false,'Anonymous execute grant absent');
set local role anon; select set_config('request.jwt.claim.sub','',true);
select is(pg_temp.literal_state($query$select search_season_players('literal-fixture','',0)$query$),'42501','Anonymous RPC execution denied');
set local role authenticated;
select is(pg_temp.literal_state($query$select search_season_players('literal-fixture','',0)$query$),'42501','Authenticated role without session rejected');
set local role postgres;
select * from finish();
rollback;
