CREATE OR REPLACE FUNCTION public.create_group(p_name text, p_settings jsonb, p_schema_version integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_group_id uuid;
  v_user_id uuid;
  v_host_name text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- display name for the host (falls back to 'Host')
  v_host_name := nullif(trim(p_settings->>'host_name'), '');
  if v_host_name is null then
    v_host_name := 'Host';
  end if;

  -- create the group
  v_group_id := gen_random_uuid();

  insert into public.groups (id, name, settings, schema_version, owner_user_id)
  values (v_group_id, p_name, p_settings, p_schema_version, v_user_id);

  -- add the creator as the host
  insert into public.members (id, group_id, name, user_id, role)
  values (gen_random_uuid(), v_group_id, v_host_name, v_user_id, 'host');

  return v_group_id;
end;
$function$
