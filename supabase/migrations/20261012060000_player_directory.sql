begin;

-- Invoker views retain authenticated table grants/RLS and avoid one query per row.
create view public.nba_season_players with (security_invoker = true) as
 select player.id, player.full_name, player.position,
   averages.season, averages.appearances, averages.minutes, averages.points,
   averages.rebounds, averages.assists, averages.steals, averages.blocks, averages.turnovers
 from public.nba_player_season_averages averages
 join public.nba_players player on player.id = averages.player_id;

-- Flatten dates for bounded root ordering; derive both teams from historical records.
create view public.nba_player_history with (security_invoker = true) as
 select stats.player_id, games.id as game_id, games.game_date, games.season,
   team.id as team_id, team.name as team_name, team.abbreviation as team_abbreviation,
   opponent.id as opponent_id, opponent.name as opponent_name,
   opponent.abbreviation as opponent_abbreviation,
   (stats.team_id = games.home_team_id) as is_home,
   stats.minutes, stats.points, stats.rebounds, stats.assists,
   stats.steals, stats.blocks, stats.turnovers
 from public.nba_player_game_stats stats
 join public.nba_games games on games.id = stats.game_id
 join public.nba_teams team on team.id = stats.team_id
 join public.nba_teams opponent on opponent.id = case
   when stats.team_id = games.home_team_id then games.away_team_id
   else games.home_team_id end;

revoke all on public.nba_season_players, public.nba_player_history from public, anon, authenticated;
grant select on public.nba_season_players, public.nba_player_history to authenticated;

notify pgrst, 'reload schema';
commit;
