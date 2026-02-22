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
end;
$function$;

revoke all on function public.remove_group_member(uuid, uuid) from public, anon, authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to anon, authenticated, service_role;
