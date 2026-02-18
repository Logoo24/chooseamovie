# DEV Notes

## Project snapshot
ChooseAMovie is a Next.js App Router + TypeScript + Tailwind app for small groups to decide what to watch; it now includes Supabase-backed group/member/rating flows with anonymous auth bootstrap, invite links with `join_code`, host-vs-joiner behavior, and local fallback for offline/unavailable cases.

## Current status
- Phase 1 group flow is implemented: create group, host lobby, join welcome, rate, results.
- Supabase client wiring is in place with environment-based fallback to local storage.
- Anonymous auth bootstrap exists and runs silently at app start.
- Group security fields are wired in app logic: `join_code` and `owner_user_id`.
- Join flow expects `join_group` RPC and stores active member locally after join.
- Ratings writes use `ratingStore` with Supabase upsert + local fallback.
- Results use Supabase-backed read path with polling refresh every 3 seconds.
- Offline/schema-mismatch banners exist for create/group pages.

## Next up
1. [ ] Validate and finalize Supabase schema for production (`groups`, `members`, `ratings`, `join_group` RPC).
2. [ ] Harden RLS so all access paths are enforced by auth + `join_code` (no local bypass for protected paths).
3. [ ] Verify member correctness across devices (dedupe, case-insensitive identity, role handling).
4. [ ] Verify ratings correctness across devices (no stale local override, conflict handling).
5. [ ] Add targeted integration tests for host create, join with code, denied without code, shared results visibility.
6. [ ] Add migration notes/scripts to keep schema + policies reproducible.

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
- RPC expected:
  - `join_group(p_group_id, p_name, p_join_code)` returns joined member row.
- RLS status:
  - App assumes RLS is enabled and policies allow owner-host create + join via RPC + member-scoped ratings.
  - Results page has friendly handling when RLS denies viewer access before join.
- `join_code` status:
  - Generated on group create (10-char hex), embedded in invite links as `/g/<groupId>?code=<join_code>`.

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
