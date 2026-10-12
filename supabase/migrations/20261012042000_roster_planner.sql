begin;

create table public.nba_teams (
  id bigint primary key, name text not null, abbreviation text not null
);
create table public.nba_players (
  id bigint primary key, full_name text not null, position text
);
create table public.nba_games (
  id text primary key check (id ~ '^[0-9]{10}$'),
  season text not null, game_date date not null,
  home_team_id bigint not null references public.nba_teams,
  away_team_id bigint not null references public.nba_teams,
  home_points integer not null check (home_points >= 0),
  away_points integer not null check (away_points >= 0),
  check (home_team_id <> away_team_id)
);
create table public.nba_player_game_stats (
  player_id bigint not null references public.nba_players,
  game_id text not null references public.nba_games,
  team_id bigint not null references public.nba_teams,
  minutes numeric not null check (minutes >= 0),
  points integer not null check (points >= 0),
  rebounds integer not null check (rebounds >= 0),
  assists integer not null check (assists >= 0),
  steals integer not null check (steals >= 0),
  blocks integer not null check (blocks >= 0),
  turnovers integer not null check (turnovers >= 0),
  primary key (player_id, game_id)
);
create table public.nba_dataset_imports (
  id uuid primary key default gen_random_uuid(),
  season text not null, completed_at timestamptz not null default now(),
  source text not null, dataset_version text not null unique,
  row_counts jsonb not null, date_min date not null, date_max date not null,
  check (date_min <= date_max)
);
create table public.rosters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users on delete cascade,
  name text not null default 'My Roster'
    check (name = btrim(name) and char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create table public.roster_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  roster_id uuid not null, player_id bigint not null references public.nba_players,
  created_at timestamptz not null default now(),
  foreign key (roster_id, user_id) references public.rosters (id, user_id) on delete cascade,
  unique (roster_id, player_id)
);
create table public.watchlist_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  player_id bigint not null references public.nba_players,
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, player_id)
);
create table public.lineup_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  roster_id uuid not null, player_id bigint not null references public.nba_players,
  lineup_date date not null,
  slot text not null check (slot in ('starter_1','starter_2','starter_3','starter_4','starter_5','bench')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (roster_id, user_id) references public.rosters (id, user_id) on delete cascade,
  unique (roster_id, lineup_date, player_id)
);
create unique index lineup_starting_slots on public.lineup_entries (roster_id, lineup_date, slot)
  where slot <> 'bench';
create index roster_members_owner on public.roster_members (user_id);
create index lineup_entries_owner_date on public.lineup_entries (user_id, lineup_date);
create index watchlist_entries_owner_created on public.watchlist_entries (user_id, created_at);
create index nba_games_date on public.nba_games (game_date);
create index nba_player_game_stats_game on public.nba_player_game_stats (game_id);

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger rosters_updated before update on public.rosters
  for each row execute function public.touch_updated_at();
create trigger watchlist_updated before update on public.watchlist_entries
  for each row execute function public.touch_updated_at();

-- Only authenticated reads of shared data. Explicit grants override project defaults.
do $$
declare t text;
begin
  foreach t in array array['nba_teams','nba_players','nba_games','nba_player_game_stats','nba_dataset_imports'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('create policy authenticated_read on public.%I for select to authenticated using (true)', t);
  end loop;
  foreach t in array array['rosters','roster_members','watchlist_entries','lineup_entries'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy owner_read on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end;
$$;
grant update (name) on public.rosters to authenticated;
create policy owner_rename on public.rosters for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant insert (player_id, notes), update (notes), delete on public.watchlist_entries to authenticated;
create policy owner_watch_insert on public.watchlist_entries for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy owner_watch_update on public.watchlist_entries for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy owner_watch_delete on public.watchlist_entries for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Client writes to memberships and lineups must use these locking RPCs.
create function public.ensure_roster() returns uuid
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); result uuid;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  insert into public.rosters (user_id) values (owner_id)
    on conflict (user_id) do nothing;
  select id into result from public.rosters where user_id = owner_id;
  return result;
end;
$$;
create function public.add_roster_player(p_player_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare roster uuid;
begin
  roster := public.ensure_roster();
  perform 1 from public.rosters where id = roster for update;
  if exists (select 1 from public.roster_members where roster_id = roster and player_id = p_player_id) then
    raise exception 'Player already belongs to your roster' using errcode = '23505';
  end if;
  if (select count(*) from public.roster_members where roster_id = roster) >= 10 then
    raise exception 'Roster capacity is ten players' using errcode = '23514';
  end if;
  insert into public.roster_members (user_id, roster_id, player_id) values (auth.uid(), roster, p_player_id);
end;
$$;
create function public.remove_roster_player(p_player_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare roster uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select id into roster from public.rosters where user_id = auth.uid() for update;
  delete from public.roster_members where roster_id = roster and player_id = p_player_id;
end;
$$;
create function public.save_lineup(p_date date, p_starters bigint[]) returns void
language plpgsql security definer set search_path = '' as $$
declare roster uuid; lower_date date; upper_date date;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select id into roster from public.rosters where user_id = auth.uid() for update;
  if roster is null then raise exception 'Create your roster first' using errcode = '23514'; end if;
  select date_min, date_max into lower_date, upper_date from public.nba_dataset_imports
    order by completed_at desc, id desc limit 1;
  if p_date is null or lower_date is null or p_date < lower_date or p_date > upper_date then
    raise exception 'Date must be within the imported season' using errcode = '23514';
  end if;
  if p_starters is null or cardinality(p_starters) <> 5 or
     (select count(distinct player_id) from unnest(p_starters) as chosen(player_id)) <> 5 then
    raise exception 'Choose exactly five distinct starters' using errcode = '23514';
  end if;
  if (select count(*) from public.roster_members where roster_id = roster and player_id = any(p_starters)) <> 5 then
    raise exception 'Every starter must belong to your current roster' using errcode = '23514';
  end if;
  delete from public.lineup_entries where roster_id = roster and lineup_date = p_date;
  insert into public.lineup_entries (user_id, roster_id, player_id, lineup_date, slot)
    select auth.uid(), roster, member.player_id, p_date,
      coalesce('starter_' || chosen.ordinality::text, 'bench')
    from public.roster_members member
    left join unnest(p_starters) with ordinality as chosen(player_id, ordinality)
      on chosen.player_id = member.player_id
    where member.roster_id = roster;
end;
$$;

revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.ensure_roster() from public, anon, authenticated;
revoke all on function public.add_roster_player(bigint) from public, anon, authenticated;
revoke all on function public.remove_roster_player(bigint) from public, anon, authenticated;
revoke all on function public.save_lineup(date, bigint[]) from public, anon, authenticated;
grant execute on function public.ensure_roster(), public.add_roster_player(bigint),
  public.remove_roster_player(bigint), public.save_lineup(date, bigint[]) to authenticated;

create view public.nba_player_season_averages with (security_invoker = true) as
  select stats.player_id, games.season, count(*) as appearances,
    avg(stats.minutes) as minutes, avg(stats.points) as points,
    avg(stats.rebounds) as rebounds, avg(stats.assists) as assists,
    avg(stats.steals) as steals, avg(stats.blocks) as blocks,
    avg(stats.turnovers) as turnovers
  from public.nba_player_game_stats stats join public.nba_games games on games.id = stats.game_id
  group by stats.player_id, games.season;
revoke all on public.nba_player_season_averages from anon, authenticated;
grant select on public.nba_player_season_averages to authenticated;

commit;
