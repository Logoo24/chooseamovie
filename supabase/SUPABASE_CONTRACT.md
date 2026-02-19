Contract summary
- Tables: groups, members, ratings, group_custom_list, group_top_titles, title_cache
- Primary keys:
  - groups(id)
  - members(id) and unique (group_id, user_id)
  - ratings(group_id, member_id, title_id)
  - group_custom_list(group_id, title_id)
  - group_top_titles(group_id, title_id)
  - title_cache(title_id)
- Common join keys:
  - members.group_id -> groups.id
  - ratings.member_id -> members.id
  - ratings.group_id -> groups.id
- Ratings column: ratings.rating (int)

Functions list
| routine_name                   | routine_type | return_type  |
| ----------------------------- | ------------ | ------------ |
| create_group                  | FUNCTION     | uuid         |
| delete_group                  | FUNCTION     | void         |
| join_group                    | FUNCTION     | members      |
| recompute_group_top_titles    | FUNCTION     | void         |

Function signatures
| function_name               | arg_types                                       | identity_args                                                   | return_type |
| -------------------------- | ---------------------------------------------- | --------------------------------------------------------------- | ----------- |
| create_group               | text, jsonb, integer                           | p_name text, p_settings jsonb, p_schema_version integer         | uuid        |
| delete_group               | uuid                                           | p_group_id uuid                                                 | void        |
| join_group                 | uuid, text, text                               | p_group_id uuid, p_name text, p_join_code text                  | members     |
| recompute_group_top_titles | uuid                                           | p_group_id uuid                                                 | void        |

Function grants
```sql
grant execute on function public.create_group(p_name text, p_settings jsonb, p_schema_version integer) to "PUBLIC", anon, authenticated, postgres, service_role;
```

Function definitions
create or replace function public.create_group(p_name text, p_settings jsonb, p_schema_version integer)
returns uuid
language plpgsql
security definer
as $function$
declare
  v_group_id uuid := gen_random_uuid();
  v_join_code text := substring(md5(random()::text) from 1 for 6);
  v_user_id uuid := auth.uid();
begin
  insert into public.groups (id, name, settings, schema_version, join_code, owner_user_id)
  values (v_group_id, p_name, p_settings, p_schema_version, v_join_code, v_user_id);

  insert into public.members (id, group_id, name, user_id, role)
  values (gen_random_uuid(), v_group_id, (p_settings->>'host_name'), v_user_id, 'host');

  return v_group_id;
end;
$function$;

create or replace function public.join_group(p_group_id uuid, p_name text, p_join_code text)
returns public.members
language plpgsql
security definer
as $function$
declare
  v_user_id uuid := auth.uid();
  v_member public.members;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if not exists (
    select 1 from public.groups g
    where g.id = p_group_id
      and g.join_code = p_join_code
  ) then
    raise exception 'invalid_join_code';
  end if;

  insert into public.members (id, group_id, name, user_id, role)
  values (gen_random_uuid(), p_group_id, p_name, v_user_id, 'member')
  on conflict (group_id, user_id)
  do update set name = excluded.name
  returning * into v_member;

  return v_member;
end;
$function$;

create or replace function public.delete_group(p_group_id uuid)
returns void
language plpgsql
security definer
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if not exists (
    select 1 from public.groups g
    where g.id = p_group_id
      and g.owner_user_id = v_user_id
  ) then
    raise exception 'forbidden';
  end if;

  delete from public.ratings where group_id = p_group_id;
  delete from public.members where group_id = p_group_id;
  delete from public.group_custom_list where group_id = p_group_id;
  delete from public.group_top_titles where group_id = p_group_id;
  delete from public.groups where id = p_group_id;
end;
$function$;

create or replace function public.recompute_group_top_titles(p_group_id uuid)
returns void
language plpgsql
security definer
as $function$
begin
  delete from public.group_top_titles where group_id = p_group_id;

  insert into public.group_top_titles (group_id, title_id, avg_rating, rating_count, updated_at)
  select
    r.group_id,
    r.title_id,
    avg(r.rating)::numeric as avg_rating,
    count(*)::integer as rating_count,
    now()
  from public.ratings r
  where r.group_id = p_group_id
  group by r.group_id, r.title_id;
end;
$function$;

Triggers
| table_name | trigger_name                  | action_timing | event_manipulation | action_statement |
| --------- | ----------------------------- | ------------- | ------------------ | ---------------- |
| ratings   | trg_recompute_group_top_titles | AFTER         | INSERT             | EXECUTE FUNCTION public.recompute_group_top_titles_trigger() |
| ratings   | trg_recompute_group_top_titles | AFTER         | UPDATE             | EXECUTE FUNCTION public.recompute_group_top_titles_trigger() |
| ratings   | trg_recompute_group_top_titles | AFTER         | DELETE             | EXECUTE FUNCTION public.recompute_group_top_titles_trigger() |

Core tables and columns
| table_name         | column_name      | data_type                | is_nullable |
| ------------------ | ---------------- | ------------------------ | ----------- |
| group_custom_list  | group_id         | uuid                     | NO          |
| group_custom_list  | title_id         | text                     | NO          |
| group_custom_list  | title_snapshot   | jsonb                    | NO          |
| group_custom_list  | position         | integer                  | NO          |
| group_custom_list  | created_at       | timestamp with time zone | NO          |
| group_top_titles   | group_id         | uuid                     | NO          |
| group_top_titles   | title_id         | text                     | NO          |
| group_top_titles   | avg_rating       | numeric                  | NO          |
| group_top_titles   | rating_count     | integer                  | NO          |
| group_top_titles   | updated_at       | timestamp with time zone | NO          |
| groups             | id               | uuid                     | NO          |
| groups             | name             | text                     | NO          |
| groups             | created_at       | timestamp with time zone | NO          |
| groups             | settings         | jsonb                    | NO          |
| groups             | schema_version   | integer                  | NO          |
| groups             | join_code        | text                     | YES         |
| groups             | owner_user_id    | uuid                     | YES         |
| members            | id               | uuid                     | NO          |
| members            | group_id         | uuid                     | NO          |
| members            | name             | text                     | NO          |
| members            | created_at       | timestamp with time zone | NO          |
| members            | user_id          | uuid                     | YES         |
| members            | role             | text                     | NO          |
| ratings            | group_id         | uuid                     | NO          |
| ratings            | member_id        | uuid                     | NO          |
| ratings            | title_id         | text                     | NO          |
| ratings            | rating           | integer                  | NO          |
| ratings            | updated_at       | timestamp with time zone | NO          |
| title_cache        | title_id         | text                     | NO          |
| title_cache        | snapshot         | jsonb                    | NO          |
| title_cache        | updated_at       | timestamp with time zone | NO          |

Indexes
| tablename         | indexname                     | indexdef |
| ---------------- | ----------------------------- | -------- |
| group_custom_list| group_custom_list_pkey        | UNIQUE (group_id, title_id) |
| group_custom_list| group_custom_list_group_idx   | (group_id) |
| group_top_titles | group_top_titles_pkey         | UNIQUE (group_id, title_id) |
| groups           | groups_pkey                   | UNIQUE (id) |
| members          | members_pkey                  | UNIQUE (id) |
| members          | members_group_user_unique     | UNIQUE (group_id, user_id) |
| ratings          | ratings_pkey                  | UNIQUE (group_id, member_id, title_id) |
| title_cache      | title_cache_pkey              | UNIQUE (title_id) |

Constraints
| table_name        | constraint_name                 | constraint_type | column_name | foreign_table_name | foreign_column_name |
| ---------------- | ------------------------------- | --------------- | ---------- | ------------------ | ------------------- |
| group_custom_list| group_custom_list_pkey          | PRIMARY KEY     | group_id   |                    |                     |
| group_custom_list| group_custom_list_pkey          | PRIMARY KEY     | title_id   |                    |                     |
| group_top_titles | group_top_titles_pkey           | PRIMARY KEY     | group_id   |                    |                     |
| group_top_titles | group_top_titles_pkey           | PRIMARY KEY     | title_id   |                    |                     |
| groups           | groups_pkey                     | PRIMARY KEY     | id         |                    |                     |
| members          | members_pkey                    | PRIMARY KEY     | id         |                    |                     |
| ratings          | ratings_pkey                    | PRIMARY KEY     | group_id   |                    |                     |
| ratings          | ratings_pkey                    | PRIMARY KEY     | member_id  |                    |                     |
| ratings          | ratings_pkey                    | PRIMARY KEY     | title_id   |                    |                     |
| title_cache      | title_cache_pkey                | PRIMARY KEY     | title_id   |                    |                     |

RLS status + policies
Which tables have RLS enabled:
| table_name         | rls_enabled | rls_forced |
| ------------------ | ---------- | ---------- |
| group_custom_list  | true       | false      |
| group_top_titles   | true       | false      |
| groups             | true       | false      |
| members            | true       | false      |
| ratings            | true       | false      |
| title_cache        | true       | false      |

All policies and their expressions
| tablename         | policyname                         | cmd    | qual | with_check |
| ---------------- | ---------------------------------- | ------ | ---- | ---------- |
| group_custom_list| custom_list_delete_group_members    | DELETE | ...  |            |
| group_custom_list| custom_list_insert_group_members    | INSERT |      | ...        |
| group_custom_list| custom_list_select_group_members    | SELECT | ...  |            |
| group_custom_list| custom_list_update_group_members    | UPDATE | ...  |            |
| groups           | groups_select_member_or_owner       | SELECT | ...  |            |
| groups           | groups_insert_authenticated         | INSERT |      | ...        |
| groups           | groups_update_owner                 | UPDATE | ...  | ...        |
| groups           | groups_delete_owner                 | DELETE | ...  |            |
| members          | members_select_group_members        | SELECT | ...  |            |
| members          | members_insert_via_join_group       | INSERT |      | ...        |
| ratings          | ratings_select_group_members        | SELECT | ...  |            |
| ratings          | ratings_upsert_own_member           | INSERT |      | ...        |
| ratings          | ratings_update_own_member           | UPDATE | ...  | ...        |
| title_cache      | title_cache_select_authenticated    | SELECT | ...  |            |
| group_top_titles | group_top_titles_select_group_members| SELECT| ...  |            |

Public tables list
| tablename |
| -------- |
| groups |
| members |
| ratings |
| group_custom_list |
| group_top_titles |
| title_cache |
