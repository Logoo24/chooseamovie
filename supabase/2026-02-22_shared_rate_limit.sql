create table if not exists public.api_rate_limit_bucket (
  scope text not null,
  client_key text not null,
  request_count integer not null default 0,
  reset_at timestamp with time zone not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  primary key (scope, client_key)
);

create index if not exists api_rate_limit_bucket_scope_reset_idx
  on public.api_rate_limit_bucket (scope, reset_at);

revoke all on table public.api_rate_limit_bucket from public, anon, authenticated;

create or replace function public.acquire_api_rate_limit(
  p_scope text,
  p_client_key text,
  p_window_seconds integer,
  p_max_requests integer
)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  remaining integer,
  reset_at timestamp with time zone
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_now timestamp with time zone := now();
  v_scope text := trim(coalesce(p_scope, ''));
  v_client_key text := trim(coalesce(p_client_key, ''));
  v_reset_at timestamp with time zone;
  v_count integer;
begin
  if v_scope = '' then
    raise exception 'invalid_scope';
  end if;
  if v_client_key = '' then
    raise exception 'invalid_client_key';
  end if;
  if p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'invalid_window_seconds';
  end if;
  if p_max_requests is null or p_max_requests < 1 then
    raise exception 'invalid_max_requests';
  end if;

  insert into public.api_rate_limit_bucket (
    scope,
    client_key,
    request_count,
    reset_at,
    created_at,
    updated_at
  )
  values (
    v_scope,
    v_client_key,
    1,
    v_now + make_interval(secs => p_window_seconds),
    v_now,
    v_now
  )
  on conflict (scope, client_key)
  do update
    set request_count = case
      when public.api_rate_limit_bucket.reset_at <= v_now then 1
      else public.api_rate_limit_bucket.request_count + 1
    end,
    reset_at = case
      when public.api_rate_limit_bucket.reset_at <= v_now then v_now + make_interval(secs => p_window_seconds)
      else public.api_rate_limit_bucket.reset_at
    end,
    updated_at = v_now
  returning public.api_rate_limit_bucket.request_count, public.api_rate_limit_bucket.reset_at
  into v_count, v_reset_at;

  allowed := v_count <= p_max_requests;
  retry_after_seconds := case
    when allowed then 0
    else greatest(1, ceil(extract(epoch from (v_reset_at - v_now)))::integer)
  end;
  remaining := greatest(0, p_max_requests - v_count);
  reset_at := v_reset_at;

  delete from public.api_rate_limit_bucket
    where scope = v_scope
      and reset_at < (v_now - interval '1 day')
      and updated_at < (v_now - interval '1 day');

  return next;
end;
$function$;

revoke all on function public.acquire_api_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.acquire_api_rate_limit(text, text, integer, integer) to service_role;
