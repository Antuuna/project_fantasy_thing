begin;

-- PostgREST treats '*' as a LIKE wildcard alias in filter values. Pass names
-- as RPC parameters instead, so PostgreSQL applies literal LIKE escaping.
create function public.search_season_players(p_season text, p_query text, p_offset integer)
returns setof public.nba_season_players
language plpgsql security invoker set search_path = '' as $$
declare literal_query text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_query is null or pg_catalog.char_length(p_query) > 80 then
    raise exception 'Search must contain at most 80 characters' using errcode = '22023';
  end if;
  if p_offset is null or p_offset < 0 or p_offset > 199980 then
    raise exception 'Search offset must be within the supported page range' using errcode = '22023';
  end if;
  literal_query := pg_catalog.replace(
    pg_catalog.replace(pg_catalog.replace(p_query, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_');
  return query
    select player.* from public.nba_season_players player
    where player.season = p_season
      and player.full_name ilike ('%' || literal_query || '%') escape E'\\'
    order by player.full_name, player.id
    limit 21 offset p_offset;
end;
$$;

revoke all on function public.search_season_players(text, text, integer) from public, anon, authenticated;
grant execute on function public.search_season_players(text, text, integer) to authenticated;
notify pgrst, 'reload schema';
commit;
