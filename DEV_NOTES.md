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
  - `ratings` (`group_id`, `member_id`, `title_id`, `value`)
  - `group_shortlist` (`group_id`, `title_key`, `title_snapshot`, `position`)
- RPC expected:
  - `join_group(p_group_id, p_name, p_join_code)` returns joined member row.
- RLS status:
  - App assumes RLS is enabled and policies allow owner-host create + join via RPC + member-scoped ratings.
  - Results page has friendly handling when RLS denies viewer access before join.
- `join_code` status:
  - Generated on group create (10-char hex), embedded in invite links as `/g/<groupId>?code=<join_code>`.

## Key routes
- `/create` group setup
- `/g/[groupId]` group hub
- `/g/[groupId]/shortlist` host custom list builder
- `/g/[groupId]/rate` rating flow
- `/g/[groupId]/results` results
- `/groups` my groups listing

## Known issues / bugs
- Cross-device security depends on correct DB policies and `join_group` RPC; misconfiguration can cause join/read failures.
- Local fallback may mask backend policy issues during development if Supabase is unavailable.
- Results polling is fixed-interval and may be noisy for large-scale usage.
- Tailwind config warning appears in build logs due to module type settings.

## Recent commits log
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
