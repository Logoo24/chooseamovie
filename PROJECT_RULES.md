# ChooseAMovie Project Rules (Read First)

## Product goal
Help small groups (families, couples, friends, roommates) quickly agree on a movie or show by rating titles and seeing the best group matches.

The app should feel like a real, public product, not a rough demo.

## Current stack
- Next.js (App Router) + TypeScript
- Tailwind CSS v4
- Client-first UI, mobile-first
- Storage:
  - Today: localStorage for quick prototyping
  - Next: Supabase (Postgres) so invite links and ratings work across devices

## Design and brand
- Default theme: dark mode, Netflix-like mood
- Accent colors: classic movie vibes (red + yellow)
- UI feel: modern, clean, polished, minimal clutter
- Always mobile-friendly (touch targets, readable text, good spacing)
- Prefer rounded corners, soft borders, subtle gradients
- Keep typography and spacing consistent across pages
- Avoid adding new UI libraries unless requested

## UX rules
- Users should always know what to do next (clear primary button).
- Provide an “Invite link” access point from:
  - Lobby
  - Rating screen (host should not lose the link)
- Prefer fast interaction patterns:
  - 1 title at a time rating loop
  - Clear skip behavior
  - Quick access to results
- Prevent dead ends:
  - Always provide navigation back to Lobby and Results

## Key flows (must remain working)
1) Create group
   - Group name input with rotating placeholders:
     - Movie night
     - Family movie night
     - What movie should we watch?
     - Roommates
   - Defaults:
     - R allowed by default (checked)
   - Settings:
     - Movies only OR Movies + Shows
     - Allowed ratings: G, PG, PG-13, R
   - Rating mode:
     - Unlimited: keep rating new titles
     - Shortlist: host adds 2–10 titles, group rates only those

2) Lobby
   - Shows group name and settings summary
   - Shows invite link + Copy + Share buttons
   - Buttons to start rating and view results

3) Join / Member identity
   - Join screen asks for display name
   - Name input placeholder should be “Your name”
   - Member identity must persist per group on the device (until Supabase auth later)

4) Rate
   - Shows one title at a time
   - 1–5 stars + Skip
   - Star buttons should look premium and animate when selected (subtle pop/glow)
   - Must support both modes:
     - Unlimited: use catalog filtered by group settings
     - Shortlist: use the user-provided titles list
   - Must always provide access to Invite link, Lobby, Results

5) Results
   - Shows ranked list (top picks)
   - Shows per-member ratings when available
   - Sorting: highest average first, then higher vote count

## Data rules (important)
- Until Supabase is fully wired:
  - localStorage is the source of truth
- During Supabase migration:
  - Prefer a small-step approach:
    - Add Supabase client
    - Write groups to Supabase
    - Read groups from Supabase
    - Then members
    - Then ratings
  - Keep localStorage fallback if Supabase env vars missing or requests fail
- Do not store secrets in the client:
  - Never use `sb_secret_...` in code
  - Only use publishable key and URL in `NEXT_PUBLIC_...` variables

## Code and architecture guidelines
- Make small, safe edits, avoid large refactors unless asked
- Keep functions and files named clearly (no cleverness)
- Prefer adding a small new file over cramming logic into pages
- Keep components reusable, but do not over-abstract early
- TypeScript: keep types strict and consistent
- Always handle error states:
  - Missing group
  - No titles left to rate
  - Supabase request failures (later)
- Always provide test steps after changes

## Performance and quality
- Keep pages fast and responsive
- Avoid large dependencies
- Ensure `npm run build` passes after changes

## Non-goals for now
- Full user accounts and login (maybe later)
- Payments
- Complex admin panels
- Perfect recommendation ML (start with simple scoring)

## Near-term roadmap (planned)
1) Supabase multiplayer: groups and ratings work across devices
2) Real titles + posters (TMDB or similar)
3) Swipe-first rating on mobile
4) Better group matching algorithm (consensus scoring)
