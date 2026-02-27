-- Supabase cleanup + performance tuning + sign-in architecture groundwork.
-- Safe to run repeatedly.

-- 1) Core table quality-of-life columns for lifecycle + recency queries.
alter table if exists public.groups
  add column if not exists updated_at timestamp with time zone not null default now(),
  add column if not exists last_activity_at timestamp with time zone not null default now(),
  add column if not exists deleted_at timestamp with time zone;

alter table if exists public.members
  add column if not exists updated_at timestamp with time zone not null default now(),
  add column if not exists status text not null default 'active',
  add column if not exists removed_at timestamp with time zone,
  add column if not exists removed_by_user_id uuid,
  add column if not exists last_seen_at timestamp with time zone;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'members_status_check'
      and conrelid = 'public.members'::regclass
  ) then
    alter table public.members
      add constraint members_status_check
      check (status in ('active', 'removed'));
  end if;
end;
$$;

alter table if exists public.ratings
  add column if not exists created_at timestamp with time zone not null default now();

alter table if exists public.group_custom_list
  add column if not exists updated_at timestamp with time zone not null default now();

-- 2) Indexes for current query patterns in the app.
create index if not exists groups_owner_created_at_idx
  on public.groups (owner_user_id, created_at desc);

create index if not exists groups_last_activity_idx
  on public.groups (last_activity_at desc)
  where deleted_at is null;

create index if not exists members_group_created_idx
  on public.members (group_id, created_at asc);

create index if not exists members_user_group_idx
  on public.members (user_id, group_id);

create index if not exists ratings_group_title_idx
  on public.ratings (group_id, title_id);

create index if not exists ratings_group_member_updated_idx
  on public.ratings (group_id, member_id, updated_at desc);

create index if not exists group_custom_list_group_position_idx
  on public.group_custom_list (group_id, position asc);

alter table if exists public.group_top_titles
  add column if not exists total_stars integer not null default 0;

create index if not exists group_top_titles_rank_idx
  on public.group_top_titles (
    group_id,
    total_stars desc,
    avg_rating desc,
    rating_count desc,
    updated_at desc
  );

-- 3) Generic updated_at trigger helper.
create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists set_groups_updated_at on public.groups;
create trigger set_groups_updated_at
before update on public.groups
for each row execute function public.set_row_updated_at();

drop trigger if exists set_members_updated_at on public.members;
create trigger set_members_updated_at
before update on public.members
for each row execute function public.set_row_updated_at();

drop trigger if exists set_group_custom_list_updated_at on public.group_custom_list;
create trigger set_group_custom_list_updated_at
before update on public.group_custom_list
for each row execute function public.set_row_updated_at();

-- 4) RPC contract alignment: create_group, join_group, recompute_group_top_titles.
create or replace function public.create_group(p_name text, p_settings jsonb, p_schema_version integer)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_group_id uuid := gen_random_uuid();
  v_user_id uuid := auth.uid();
  v_host_name text;
  v_join_code text := substring(md5(random()::text) from 1 for 8);
  v_is_anonymous boolean := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;
  if v_is_anonymous then
    raise exception 'host_account_required';
  end if;

  v_host_name := nullif(trim(p_settings->>'host_name'), '');
  if v_host_name is null then
    v_host_name := 'Host';
  end if;

  insert into public.groups (
    id,
    name,
    settings,
    schema_version,
    join_code,
    owner_user_id,
    last_activity_at
  )
  values (
    v_group_id,
    p_name,
    p_settings,
    p_schema_version,
    v_join_code,
    v_user_id,
    now()
  );

  insert into public.members (
    id,
    group_id,
    name,
    user_id,
    role,
    status,
    last_seen_at
  )
  values (
    gen_random_uuid(),
    v_group_id,
    v_host_name,
    v_user_id,
    'host',
    'active',
    now()
  )
  on conflict (group_id, user_id)
  do update
    set name = excluded.name,
        role = 'host',
        status = 'active',
        removed_at = null,
        removed_by_user_id = null,
        last_seen_at = now(),
        updated_at = now();

  return v_group_id;
end;
$function$;

create or replace function public.join_group(p_group_id uuid, p_name text, p_join_code text)
returns public.members
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_member public.members;
  v_name text := nullif(trim(p_name), '');
  v_code text := trim(coalesce(p_join_code, ''));
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if v_name is null then
    raise exception 'invalid_member_name';
  end if;

  if not exists (
    select 1
    from public.groups g
    where g.id = p_group_id
      and g.deleted_at is null
      and (
        v_code = g.id::text
        or (g.join_code is not null and v_code = g.join_code)
      )
  ) then
    raise exception 'invalid_join_code';
  end if;

  insert into public.members (
    id,
    group_id,
    name,
    user_id,
    role,
    status,
    removed_at,
    removed_by_user_id,
    last_seen_at
  )
  values (
    gen_random_uuid(),
    p_group_id,
    v_name,
    v_user_id,
    'member',
    'active',
    null,
    null,
    now()
  )
  on conflict (group_id, user_id)
  do update
    set name = excluded.name,
        status = 'active',
        removed_at = null,
        removed_by_user_id = null,
        last_seen_at = now(),
        updated_at = now()
  returning * into v_member;

  update public.groups
    set last_activity_at = now()
  where id = p_group_id;

  return v_member;
end;
$function$;

create or replace function public.recompute_group_top_titles(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_limit integer := 100;
begin
  select
    case
      when g.settings ? 'top_titles_limit'
        and (g.settings->>'top_titles_limit') ~ '^[0-9]+$'
      then greatest(1, least(100, (g.settings->>'top_titles_limit')::integer))
      else 100
    end
  into v_limit
  from public.groups g
  where g.id = p_group_id;

  if v_limit is null then
    v_limit := 100;
  end if;

  delete from public.group_top_titles
  where group_id = p_group_id;

  insert into public.group_top_titles (
    group_id,
    title_id,
    total_stars,
    avg_rating,
    rating_count,
    updated_at
  )
  select
    ranked.group_id,
    ranked.title_id,
    ranked.total_stars,
    ranked.avg_rating,
    ranked.rating_count,
    now()
  from (
    select
      r.group_id,
      r.title_id,
      sum(case when r.rating > 0 then r.rating else 0 end)::integer as total_stars,
      avg(nullif(r.rating, 0))::numeric as avg_rating,
      count(*) filter (where r.rating > 0)::integer as rating_count
    from public.ratings r
    where r.group_id = p_group_id
    group by r.group_id, r.title_id
    having count(*) filter (where r.rating > 0) > 0
    order by
      sum(case when r.rating > 0 then r.rating else 0 end) desc,
      avg(nullif(r.rating, 0)) desc,
      count(*) filter (where r.rating > 0) desc,
      r.title_id asc
    limit v_limit
  ) ranked;

  update public.groups
    set last_activity_at = now()
  where id = p_group_id;
end;
$function$;

create or replace function public.remove_group_member(p_group_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_target_role text;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if not exists (
    select 1
    from public.groups g
    where g.id = p_group_id
      and g.owner_user_id = v_user_id
  ) then
    raise exception 'forbidden';
  end if;

  select m.role
    into v_target_role
  from public.members m
  where m.group_id = p_group_id
    and m.id = p_member_id;

  if not found then
    raise exception 'member_not_found';
  end if;

  if coalesce(v_target_role, '') = 'host' then
    raise exception 'cannot_remove_host';
  end if;

  delete from public.ratings r
  where r.group_id = p_group_id
    and r.member_id = p_member_id;

  delete from public.members m
  where m.group_id = p_group_id
    and m.id = p_member_id;

  update public.groups
    set last_activity_at = now()
  where id = p_group_id;
end;
$function$;

create or replace function public.recompute_group_top_titles_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_group_id uuid := coalesce(new.group_id, old.group_id);
begin
  if v_group_id is not null then
    perform public.recompute_group_top_titles(v_group_id);
  end if;
  return coalesce(new, old);
end;
$function$;

drop trigger if exists trg_recompute_group_top_titles on public.ratings;
create trigger trg_recompute_group_top_titles
after insert or update or delete on public.ratings
for each row execute function public.recompute_group_top_titles_trigger();

-- Keep group activity fresh when custom lists change.
create or replace function public.touch_group_last_activity_from_custom_list()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.groups
    set last_activity_at = now()
  where id = coalesce(new.group_id, old.group_id);

  return coalesce(new, old);
end;
$function$;

drop trigger if exists trg_touch_group_last_activity_custom_list on public.group_custom_list;
create trigger trg_touch_group_last_activity_custom_list
after insert or update or delete on public.group_custom_list
for each row execute function public.touch_group_last_activity_from_custom_list();

-- 5) Sign-in groundwork tables.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  username text,
  onboarding_completed boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  last_seen_at timestamp with time zone
);

alter table if exists public.profiles
  add column if not exists email text,
  add column if not exists display_name text,
  add column if not exists avatar_url text,
  add column if not exists username text,
  add column if not exists onboarding_completed boolean not null default false,
  add column if not exists created_at timestamp with time zone not null default now(),
  add column if not exists updated_at timestamp with time zone not null default now(),
  add column if not exists last_seen_at timestamp with time zone;

create unique index if not exists profiles_username_uidx
  on public.profiles (lower(username))
  where username is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_username_format_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_username_format_check
      check (username is null or username ~ '^[a-z0-9_]{3,24}$');
  end if;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_row_updated_at();

create table if not exists public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  code text not null unique,
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  expires_at timestamp with time zone,
  max_uses integer not null default 0,
  used_count integer not null default 0,
  revoked_at timestamp with time zone,
  metadata jsonb not null default '{}'::jsonb,
  check (max_uses >= 0),
  check (used_count >= 0),
  check (max_uses = 0 or used_count <= max_uses)
);

create index if not exists group_invites_group_created_idx
  on public.group_invites (group_id, created_at desc);

create index if not exists group_invites_code_idx
  on public.group_invites (code);

-- 6) Profile helper for client-side sign-in bootstrap.
create or replace function public.upsert_my_profile(
  p_display_name text default null,
  p_avatar_url text default null
)
returns public.profiles
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_email text := nullif(trim(coalesce((auth.jwt() ->> 'email')::text, '')), '');
  v_profile public.profiles;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  insert into public.profiles (
    user_id,
    email,
    display_name,
    avatar_url,
    last_seen_at
  )
  values (
    v_user_id,
    v_email,
    nullif(trim(p_display_name), ''),
    nullif(trim(p_avatar_url), ''),
    now()
  )
  on conflict (user_id)
  do update
    set email = coalesce(excluded.email, public.profiles.email),
        display_name = coalesce(excluded.display_name, public.profiles.display_name),
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
        last_seen_at = now(),
        updated_at = now()
  returning * into v_profile;

  return v_profile;
end;
$function$;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  delete from auth.users
  where id = v_user_id;
end;
$function$;

-- 7) Grants for current app + new bootstrap function.
do $$
begin
  if to_regprocedure('public.create_group(text, jsonb, integer)') is not null then
    execute 'revoke all on function public.create_group(text, jsonb, integer) from public';
    execute 'grant execute on function public.create_group(text, jsonb, integer) to anon, authenticated, service_role';
  end if;

  if to_regprocedure('public.join_group(uuid, text, text)') is not null then
    execute 'revoke all on function public.join_group(uuid, text, text) from public';
    execute 'grant execute on function public.join_group(uuid, text, text) to anon, authenticated, service_role';
  end if;

  if to_regprocedure('public.delete_group(uuid)') is not null then
    execute 'revoke all on function public.delete_group(uuid) from public';
    execute 'grant execute on function public.delete_group(uuid) to anon, authenticated, service_role';
  end if;

  if to_regprocedure('public.recompute_group_top_titles(uuid)') is not null then
    execute 'revoke all on function public.recompute_group_top_titles(uuid) from public';
    execute 'grant execute on function public.recompute_group_top_titles(uuid) to anon, authenticated, service_role';
  end if;

  if to_regprocedure('public.remove_group_member(uuid, uuid)') is not null then
    execute 'revoke all on function public.remove_group_member(uuid, uuid) from public';
    execute 'grant execute on function public.remove_group_member(uuid, uuid) to anon, authenticated, service_role';
  end if;

  if to_regprocedure('public.upsert_my_profile(text, text)') is not null then
    execute 'revoke all on function public.upsert_my_profile(text, text) from public';
    execute 'grant execute on function public.upsert_my_profile(text, text) to anon, authenticated, service_role';
  end if;

  if to_regprocedure('public.delete_my_account()') is not null then
    execute 'revoke all on function public.delete_my_account() from public';
    execute 'grant execute on function public.delete_my_account() to authenticated, service_role';
  end if;
end;
$$;

-- 8) RLS for new tables.
alter table public.profiles enable row level security;
alter table public.group_invites enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_select_own'
  ) then
    create policy profiles_select_own
      on public.profiles
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_insert_own'
  ) then
    create policy profiles_insert_own
      on public.profiles
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_update_own'
  ) then
    create policy profiles_update_own
      on public.profiles
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'group_invites' and policyname = 'group_invites_select_owner'
  ) then
    create policy group_invites_select_owner
      on public.group_invites
      for select
      using (
        exists (
          select 1
          from public.groups g
          where g.id = group_invites.group_id
            and g.owner_user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'group_invites' and policyname = 'group_invites_insert_owner'
  ) then
    create policy group_invites_insert_owner
      on public.group_invites
      for insert
      with check (
        exists (
          select 1
          from public.groups g
          where g.id = group_invites.group_id
            and g.owner_user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'group_invites' and policyname = 'group_invites_update_owner'
  ) then
    create policy group_invites_update_owner
      on public.group_invites
      for update
      using (
        exists (
          select 1
          from public.groups g
          where g.id = group_invites.group_id
            and g.owner_user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1
          from public.groups g
          where g.id = group_invites.group_id
            and g.owner_user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'group_invites' and policyname = 'group_invites_delete_owner'
  ) then
    create policy group_invites_delete_owner
      on public.group_invites
      for delete
      using (
        exists (
          select 1
          from public.groups g
          where g.id = group_invites.group_id
            and g.owner_user_id = auth.uid()
        )
      );
  end if;
end;
$$;

-- 9) Keep realtime subscriptions valid for app screens.
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.members';
  exception
    when duplicate_object then null;
  end;

  begin
    execute 'alter publication supabase_realtime add table public.ratings';
  exception
    when duplicate_object then null;
  end;

  begin
    execute 'alter publication supabase_realtime add table public.group_top_titles';
  exception
    when duplicate_object then null;
  end;
end;
$$;
