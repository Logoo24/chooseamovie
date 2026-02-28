# DEV Notes

## Project snapshot
ChooseAMovie is a Next.js App Router + TypeScript + Tailwind app for small groups to decide what to watch, with Supabase-backed group/member/rating flows, TMDB-backed custom list building, and host/joiner role separation.

## Current status
- Group hub flow is active at `/g/[groupId]` with host actions (invite/rate/results/custom list edit) and joiner-safe access.
- Create flow supports `Unlimited rating` and custom list mode labels:
  - `Custom Movie List` (movies-only)
  - `Custom Movie/Show List` (movies + shows)
- Custom list builder at `/g/[groupId]/shortlist` is host-only and uses TMDB proxy search.
- Custom list items are persisted in `group_custom_list` as they are added/removed and survive refresh/navigation.
- `/groups` page lists hosted and joined groups using Supabase where possible, with local fallback.

## Next up
1. [ ] Add drag-and-drop ordering in custom list builder and wire to `reorderShortlist`.
2. [ ] Add dedicated TMDB trending proxy route for richer suggestions.
3. [ ] Add integration tests for create -> custom list -> hub and host/joiner page guards.
4. [ ] Add migration scripts for `group_custom_list` constraints and indexes.

## How to run locally
```bash
npm install
npm run dev
```

## Environment setup
Create `.env.local` with:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_publishable_anon_key
```

Do not commit real keys.

## Supabase notes
- Core tables used by app logic:
  - `groups` (`id`, `name`, `created_at`, `schema_version`, `join_code`, `owner_user_id`, `settings`)
  - `members` (`id`, `group_id`, `user_id`, `name`, `role`, `created_at`)
  - `ratings` (`group_id`, `member_id`, `title_id`, `rating`, `updated_at`)
  - `group_custom_list` (`group_id`, `title_id`, `title_snapshot`, `position`, `created_at`)
  - `group_top_titles` (`group_id`, `title_id`, `avg_rating`, `rating_count`, `updated_at`)
  - `title_cache` (`title_id`, `snapshot`, `updated_at`)
- RPC expected:
  - `create_group(p_name text, p_settings jsonb, p_schema_version integer) -> uuid` (single UUID string group id)
  - `join_group(p_group_id, p_name, p_join_code)` returns joined member row.
  - `delete_group(p_group_id)`
  - `recompute_group_top_titles(p_group_id)`
- Function grants:
  - `grant execute on function public.create_group(p_name text, p_settings jsonb, p_schema_version integer) to "PUBLIC", anon, authenticated, postgres, service_role;`
- RLS status:
  - App assumes RLS is enabled and policies allow owner-host create + join via RPC + member-scoped ratings.
  - Results page has friendly handling when RLS denies viewer access before join.
- `join_code` status:
  - Invite links use `/g/<groupId>`.
  - `join_group` receives `p_join_code = groupId` (string form of the UUID in the URL).
- Top picks setting:
  - `groups.settings.top_titles_limit` controls how many rows `recompute_group_top_titles` stores (default `100`).

## Key routes
- `/create` group setup
- `/g/[groupId]` group hub
- `/g/[groupId]/custom-list` host custom list builder
- `/g/[groupId]/rate` rating flow
- `/g/[groupId]/results` results
- `/groups` my groups listing

## Developer diagnostics
### Common network errors and what they usually mean
- `401/403` on `members`/`ratings`/`group_top_titles`: RLS denied access (viewer has not joined, or policy mismatch).
- `400` with unknown column (`value` on `ratings`, wrong cache column on `title_cache`): app/database contract mismatch. App must use `ratings.rating`, `group_custom_list`, and `title_cache.snapshot`.
- RPC error on `recompute_group_top_titles` or `join_group`: missing RPC in database or wrong argument names.
- `Failed to fetch` / timeout: connection issue to Supabase project or invalid URL/key in `.env.local`.

### Ratings write constraints (required for upsert conflict key)
Run this SQL once if the unique constraint/index is missing:

```sql
create unique index if not exists ratings_group_member_title_uidx
  on public.ratings (group_id, member_id, title_id);
```

### Smoke test checklist
1. Create group: open `/create`, finish wizard, and verify group home loads with shareable invite link `/g/<groupId>`.
2. Join from link: open invite link on a second session/device, join with a name, and confirm join succeeds.
3. Rate a title: on `/g/<groupId>/rate`, submit a rating and confirm one `ratings` row exists for `(group_id, member_id, title_id)` using `rating`.
4. Results ranking list: open `/g/<groupId>/results`, verify rows come from `group_top_titles` ordering, and verify Top `10/20/50/100` toggles are display-only slices.
5. Refresh persistence: refresh home/rate/results pages and confirm group, members, ratings, and custom list still load.
6. Second device sync: join from another device/session, submit ratings, and verify results/members update.
7. Members list updates: host removes a member on `/g/<groupId>` and verify list updates and removed member no longer appears.

## Known issues / bugs
- Cross-device security depends on correct DB policies and `join_group` RPC; misconfiguration can cause join/read failures.
- Local fallback may mask backend policy issues during development if Supabase is unavailable.
- Results polling is fixed-interval and may be noisy for large-scale usage.
- Tailwind config warning appears in build logs due to module type settings.

## Recent commits log
### 2026-02-27 - haptics (`71c6d9a`)
- Update summary pending.
### 2026-02-27 - Bug fixes (`83eeeee`)
- Update summary pending.
### 2026-02-27 - Sign in smoothing (`68d1525`)
- Update summary pending.
### 2026-02-27 - Small fixes (`404b015`)
- Update summary pending.
### 2026-02-27 - Google fix (`e393f70`)
- Update summary pending.
### 2026-02-27 - UI and Sign in features! (`0d7f092`)
- Update summary pending.
### 2026-02-27 - Ui and other (`a15b3c7`)
- Update summary pending.
### 2026-02-26 - Sign-in features + Branding refresh (`d2d7b1b`)
- Update summary pending.
### 2026-02-21 - Version 1.0 (`07ae19d`)
- Update summary pending.
### 2026-02-19 - Fixed bugs in custom list (`6ec69aa`)
- Update summary pending.
### 2026-02-19 - New ranking system, UI refresh (`442117f`)
- Update summary pending.
### 2026-02-18 - Release 1.0 (`71d8b7a`)
- Update summary pending.
### 2026-02-18 - WIP: polish + ratings/results fixes (`0dbdd6a`)
- Update summary pending.
### 2026-02-17 - WIP: polish + ratings/results fixes (`e5e5803`)
- Update summary pending.
### 2026-02-17 - WIP: Phase 2 polish, TMDB routes, endless mode, title cache (`48b68c0`)
- Update summary pending.
### 2026-02-17 - Phase 1: Supabase scaffolding, host/join flow, rate/results routes (`0dae42f`)
- Added Supabase integration scaffolding and local fallback behavior.
- Implemented host/join split and core route flow for group, rate, and results.
- Wired storage/rating helpers to support incremental migration.

### 2026-02-17 - Polish UI: dark theme, popcorn branding, improved pages (`cdb238a`)
- Updated visual style to dark movie-night theme with red/yellow accents.
- Added shared UI components and branding polish.
- Improved page layout consistency across create/lobby/results views.

### 2026-02-17 - Feature 1: create group and lobby (`ef8567e`)
- Added initial create-group and lobby flow.
- Introduced local persistence for group settings.
- Added invite-link basics and navigation flow.

### 2026-02-16 - Update README.md (`d5d27b2`)
- Refreshed project overview and local run instructions.

### 2026-02-16 - Initial Next.js app (`77bbce3`)
- Bootstrapped Next.js app and base project configuration.
