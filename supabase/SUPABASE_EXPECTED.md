# Supabase Expected Contract (App + Architecture)

This document is the practical contract the current app expects from Supabase.

## Required tables (current app runtime)

### `public.groups`
- Required columns:
  - `id uuid primary key`
  - `name text not null`
  - `created_at timestamptz not null`
  - `schema_version integer not null`
  - `settings jsonb not null`
  - `owner_user_id uuid null`
  - `join_code text null`
- Now added for operational efficiency:
  - `updated_at timestamptz not null default now()`
  - `last_activity_at timestamptz not null default now()`
  - `deleted_at timestamptz null`
- App reads: `id,name,created_at,schema_version,join_code,owner_user_id,settings`
- App writes: insert via `create_group` RPC, updates `settings` directly.

### `public.members`
- Required columns:
  - `id uuid primary key`
  - `group_id uuid not null`
  - `user_id uuid null`
  - `name text not null`
  - `role text not null` (`host` or `member`)
  - `created_at timestamptz not null`
- Required uniqueness:
  - unique `(group_id, user_id)`
- Now added:
  - `updated_at timestamptz not null default now()`
  - `status text not null default 'active' check in ('active','removed')`
  - `removed_at timestamptz null`
  - `removed_by_user_id uuid null`
  - `last_seen_at timestamptz null`
- App reads by `group_id`, and by `(group_id,user_id)`.

### `public.ratings`
- Required columns:
  - `group_id uuid not null`
  - `member_id uuid not null`
  - `title_id text not null`
  - `rating integer not null` (`0` means skip)
  - `updated_at timestamptz not null`
- Required uniqueness:
  - unique `(group_id, member_id, title_id)`
- Now added:
  - `created_at timestamptz not null default now()`

### `public.group_custom_list`
- Required columns:
  - `group_id uuid not null`
  - `title_id text not null`
  - `title_snapshot jsonb not null`
  - `position integer not null`
  - `created_at timestamptz not null`
- Required uniqueness:
  - unique `(group_id, title_id)`
- Now added:
  - `updated_at timestamptz not null default now()`

### `public.group_top_titles`
- Required columns:
  - `group_id uuid not null`
  - `title_id text not null`
  - `total_stars integer not null`
  - `avg_rating numeric not null`
  - `rating_count integer not null`
  - `updated_at timestamptz not null`
- Required uniqueness:
  - unique `(group_id, title_id)`

### `public.title_cache`
- Required columns:
  - `title_id text primary key`
  - `snapshot jsonb not null`
  - `updated_at timestamptz not null`

### `public.api_rate_limit_bucket` (server-only TMDB proxy support)
- Required columns:
  - `scope text`
  - `client_key text`
  - `request_count integer`
  - `reset_at timestamptz`
  - `created_at timestamptz`
  - `updated_at timestamptz`
- Required primary key:
  - `(scope, client_key)`

## New architecture tables (sign-in foundation)

### `public.profiles`
- `user_id uuid primary key references auth.users(id)`
- `email text`
- `display_name text`
- `avatar_url text`
- `username text` (case-insensitive unique index on lower(username), nullable)
- `onboarding_completed boolean not null default false`
- `created_at/updated_at/last_seen_at`

### `public.group_invites`
- `id uuid primary key default gen_random_uuid()`
- `group_id uuid not null references public.groups(id)`
- `code text not null unique`
- `created_by_user_id uuid not null references auth.users(id)`
- `created_at, expires_at, revoked_at`
- `max_uses integer not null default 0`
- `used_count integer not null default 0`
- `metadata jsonb not null default '{}'::jsonb`

## Required RPC functions

### `create_group(p_name text, p_settings jsonb, p_schema_version integer) -> uuid`
- Must require authenticated/anonymous Supabase auth session (`auth.uid()` non-null).
- Must reject anonymous users with `host_account_required` (host must have an account).
- Must create:
  - one `groups` row
  - one host `members` row
- Throws `auth_required` when unauthenticated.

### `join_group(p_group_id uuid, p_name text, p_join_code text) -> members`
- Must require `auth.uid()`.
- Must accept either:
  - `p_join_code = p_group_id::text` (current app behavior), or
  - `p_join_code = groups.join_code` (future invite-code behavior).
- Must upsert member by `(group_id,user_id)` and return member row.
- Throws `invalid_join_code` for invalid joins.

### `delete_group(p_group_id uuid) -> void`
- Must require group owner.

### `remove_group_member(p_group_id uuid, p_member_id uuid) -> void`
- Must require group owner.
- Must reject host removal.

### `recompute_group_top_titles(p_group_id uuid) -> void`
- Must recompute ranking from `ratings`.
- Must exclude skip ratings (`rating = 0`) from vote count and averages.
- Must respect `groups.settings.top_titles_limit` (clamped 1..100, default 100).

### `acquire_api_rate_limit(...) -> table(...)`
- Used by server-side TMDB proxy only.

### `upsert_my_profile(p_display_name text default null, p_avatar_url text default null) -> profiles`
- Sign-in architecture helper.

## Required indexes

- `groups_owner_created_at_idx (owner_user_id, created_at desc)`
- `groups_last_activity_idx (last_activity_at desc) where deleted_at is null`
- `members_group_created_idx (group_id, created_at asc)`
- `members_user_group_idx (user_id, group_id)`
- `ratings_group_title_idx (group_id, title_id)`
- `ratings_group_member_updated_idx (group_id, member_id, updated_at desc)`
- `group_custom_list_group_position_idx (group_id, position asc)`
- `group_top_titles_rank_idx (group_id, total_stars desc, avg_rating desc, rating_count desc, updated_at desc)`
- `profiles_username_uidx (lower(username)) where username is not null`
- `group_invites_group_created_idx (group_id, created_at desc)`
- `group_invites_code_idx (code)`

## Required realtime publication

`supabase_realtime` must include:
- `public.members`
- `public.ratings`
- `public.group_top_titles`

## RLS expectations

- Existing app tables (`groups`, `members`, `ratings`, `group_custom_list`, `group_top_titles`, `title_cache`) require RLS policies that permit owner/member access patterns used by the app.
- `profiles` uses self-only RLS (read/write own row).
- `group_invites` uses owner-only management policies.
