alter table if exists public.group_top_titles
  add column if not exists total_stars integer not null default 0;

create or replace function public.recompute_group_top_titles(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  delete from public.group_top_titles where group_id = p_group_id;

  insert into public.group_top_titles (
    group_id,
    title_id,
    total_stars,
    avg_rating,
    rating_count,
    updated_at
  )
  select
    r.group_id,
    r.title_id,
    sum(case when r.rating > 0 then r.rating else 0 end)::integer as total_stars,
    avg(nullif(r.rating, 0))::numeric as avg_rating,
    count(*) filter (where r.rating > 0)::integer as rating_count,
    now()
  from public.ratings r
  where r.group_id = p_group_id
  group by r.group_id, r.title_id
  having count(*) filter (where r.rating > 0) > 0;
end;
$function$;

create index if not exists group_top_titles_rank_idx
  on public.group_top_titles (
    group_id,
    total_stars desc,
    avg_rating desc,
    rating_count desc,
    updated_at desc
  );

do $$
declare
  v_group_id uuid;
begin
  for v_group_id in select id from public.groups loop
    perform public.recompute_group_top_titles(v_group_id);
  end loop;
end;
$$;
