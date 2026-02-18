# DEV Notes

## Project snapshot
ChooseAMovie is a Next.js App Router + TypeScript + Tailwind app for small groups to decide what to watch, with Supabase-backed group/member/rating flows, TMDB-backed custom list building, and host/joiner role separation.

## Current status
- Group hub flow is active at `/g/[groupId]` with host actions (invite/rate/results/custom list edit) and joiner-safe access.
- Create flow supports `Unlimited rating` and custom list mode labels:
  - `Custom Movie List` (movies-only)
  - `Custom Movie/Show List` (movies + shows)
- Custom list builder at `/g/[groupId]/shortlist` is host-only and uses TMDB proxy search.
- Custom list items are persisted in `group_shortlist` as they are added/removed and survive refresh/navigation.
- `/groups` page lists hosted and joined groups using Supabase where possible, with local fallback.

## Next up
1. [ ] Add drag-and-drop ordering in custom list builder and wire to `reorderShortlist`.
2. [ ] Add dedicated TMDB trending proxy route for richer suggestions.
3. [ ] Add integration tests for create -> custom list -> hub and host/joiner page guards.
4. [ ] Add migration scripts for `group_shortlist` constraints and indexes.

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
  - `group_shortlist` (`group_id`, `title_id`, `title_snapshot`, `position`, `created_at`)
  - `group_top_titles` (`group_id`, `title_id`, `avg_rating`, `rating_count`, `updated_at`)
  - `title_cache` (`title_id`, `snapshot`, `updated_at`)
- RPC expected:
  - `join_group(p_group_id, p_name, p_join_code)` returns joined member row.
  - `delete_group(p_group_id)`
  - `recompute_group_top_titles(p_group_id)`
- RLS status:
  - App assumes RLS is enabled and policies allow owner-host create + join via RPC + member-scoped ratings.
  - Results page has friendly handling when RLS denies viewer access before join.
- `join_code` status:
  - Generated on group create (10-char hex), embedded in invite links as `/g/<groupId>?code=<join_code>`.

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
- `400` with unknown column (`value`, `title_key`, `title_snapshot` on `title_cache`): schema mismatch between app and database.
- RPC error on `recompute_group_top_titles` or `join_group`: missing RPC in database or wrong argument names.
- `Failed to fetch` / timeout: connection issue to Supabase project or invalid URL/key in `.env.local`.

### Ratings write constraints (required for upsert conflict key)
Run this SQL once if the unique constraint/index is missing:

```sql
create unique index if not exists ratings_group_member_title_uidx
  on public.ratings (group_id, member_id, title_id);
```

### Quick write verification
1. Open `/g/<groupId>/rate` as a joined member.
2. Click a star on a title.
3. Confirm one row exists/updates in `ratings` for that exact `(group_id, member_id, title_id)` with `rating`.
4. Open `/g/<groupId>/results` and verify the title appears in top picks (from `group_top_titles`).
5. Refresh Results and verify title/poster stays stable (no fallback flash to empty/no-art state).

## Known issues / bugs
- Cross-device security depends on correct DB policies and `join_group` RPC; misconfiguration can cause join/read failures.
- Local fallback may mask backend policy issues during development if Supabase is unavailable.
- Results polling is fixed-interval and may be noisy for large-scale usage.
- Tailwind config warning appears in build logs due to module type settings.

## Recent commits log
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
