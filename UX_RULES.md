# ChooseAMovie UX Rules

This document is the source of truth for user flow, page hierarchy, and UI consistency. Follow it exactly for all future changes.

## Product vibe
- Dark mode by default, Netflix-like contrast.
- Accent colors: classic movie vibe (red primary, yellow highlight).
- UI should feel modern, minimal, and mobile-first.
- Prefer clean spacing, strong typography, and clear hierarchy over dense layouts.

## Core user types
### Host
- Can create groups.
- Can see invite link (always).
- Can configure group settings.
- Can build and edit the Custom List when the group is in Custom List mode.
- Can remove members.
- Can delete the group.

### Member (joiner)
- Can join a group with a valid invite link.
- Can rate titles and view results once joined.
- Must not see host-only actions or controls.
- Can leave groups they joined (not groups they host).
- Can only see invite link if host enabled a group setting: `allow_members_invite_link`.

## Global UI rules
- Mobile-first layout. Desktop enhances spacing and columns, never breaks mobile.
- Use cards for sections, not long mixed content blocks.
- One main primary action per screen. Secondary actions are visually quieter.
- Avoid clutter:
  - No more than 2 primary buttons visible at once.
  - Group actions belong in cards, not scattered.
- Forms:
  - One main input focus per step.
  - Clear labels, helpful placeholders, short helper text.
- Buttons:
  - Never nest `<button>` inside `<button>`.
  - If a clickable card contains a button, the card must be a `div` with `role="button"` + keyboard support.
- Loading and errors:
  - Use consistent StateCard patterns for loading/error/empty states.
  - Errors should be human-readable and tell the user what to do next.
- Refresh safety:
  - Refreshing should not lose important progress. Persist drafts where appropriate.

## Navigation and routes
### Home (Landing) `/`
Purpose: marketing + entry point + user’s groups overview.

Must include:
- Hero promo section for ChooseAMovie.
- Two CTAs:
  1) **Create group** (primary)
  2) **Join with code** (placeholder for now, disabled or placeholder route)
- “My groups” section:
  - Shows groups user hosts or has joined.
  - Each group card links to that group’s Hub.
  - Each group card has a 3-dot menu:
    - If host: Delete group
    - If member: Leave group
  - Actions require confirmation.

### Create flow `/create`
Create is a step-by-step wizard with slide transition between steps.

Steps:
1) **Your name**
   - Collect host display name.
   - Placeholder text: “Your name”
   - Store locally for now (later becomes account setup).
2) **Group name**
   - Group name input with rotating placeholder suggestions:
     - “Movie night”
     - “Family movie night”
     - “What should we watch?”
     - “Roommates”
3) **Chooser settings**
   - Choose mode:
     - **Endless mode** (rate continuously)
     - **Custom list** (host adds exact titles)
   - Endless mode shows filters:
     - Content type: Movies or Movies + Shows
     - Allowed ratings
     - Categories (placeholder UI)
     - Streaming services (placeholder UI)
   - Custom list mode hides all filters (ratings/categories/services) because the host is hand-picking titles.
   - Submit creates the group and routes:
     - Endless mode: to Group Hub
     - Custom list mode: to Custom List Builder

### Group Hub `/g/[groupId]`
Purpose: the “home” for a specific group. Hub is the default landing for the invite link.

Title format:
- **“{Group Name} ChooseAMovie Hub”**

Hierarchy requirement:
1) **Invite card is the hero**
   - Highest visual priority.
   - Contains invite instructions.
   - Invite link:
     - Visible to host always.
     - Visible to members only if `allow_members_invite_link = true`.
   - Copy-to-clipboard action.

2) Cards below (stacked on mobile, grid on desktop):
- Group setup summary (read-only for members)
- Members list
  - Host can remove members.
  - Members can see list but no remove controls.
- Custom list preview (only if custom list mode)
  - Host can go to edit builder.
  - Members see preview only.
- Stats card:
  - total combined ratings count
  - number of members
- Results preview card:
  - shows top ranked titles (top 3)
  - tap to open full Results

Hub actions:
- **Rate** (primary for members and host once joined)
- Results
- Host-only:
  - Edit Custom List (only in custom list mode)
- Create new group (secondary action)

### Custom List Builder `/g/[groupId]/custom-list`
Purpose: host builds the exact set of titles to be rated.

Rules:
- Host-only page. Members see a friendly “Hosts only” StateCard.
- Must persist progress:
  - Titles are saved to Supabase as they are added/removed.
  - Refresh should restore the list from Supabase.
  - Optional local draft state allowed, but Supabase is source of truth.

Search UX:
- Search uses internal proxy route(s) only (`/api/tmdb/search`). Never call TMDB directly from client.
- After host clicks **Add**:
  - Clear the search input immediately.
  - Show suggestions below when input is empty.
  - When user types again, suggestions disappear and search results show.
- No item limit (not capped at 10).

Progress controls:
- **Next** button:
  - Disabled and visually faded until at least **2** titles are in the list.
  - On click: confirms and routes back to Hub.
- **Back** button:
  - Routes back to Hub.
  - Must not lose progress.

### Rate `/g/[groupId]/rate`
Purpose: rate titles.

Rules:
- Member must be joined (active member exists).
- Host can rate too, but host status must not be granted to joiners.
- If group is in custom list mode, candidates come from group custom list.
- If group is in endless mode, candidates come from discovery sources (later).
- Poster + title + key metadata should be shown when available.
- Star rating should have a subtle animation on hover/tap and on selection.

### Results `/g/[groupId]/results`
Purpose: show ranked picks.

Rules:
- Member must be joined. If RLS blocks, show “Join to see results.”
- Show group ranking by aggregate score.
- Show per-member ratings (toggle or expandable view).
- Polling is allowed (every ~3s). Avoid flicker with minimal “Updating…” indicator.

## Data and security rules (high level)
- Supabase is the source of truth for cross-device features.
- Anonymous auth is required before any writes.
- Invite links require `?code=` (join_code).
- Join uses `join_group` RPC.
- RLS must enforce that only members can read/write group data.

## Copy rules (verbiage)
- Use “Custom list” label in settings, but user-facing page/header should read:
  - “Custom Movie List” for Movies-only
  - “Custom Movie/Show List” when shows are enabled
- Use “Hub” consistently:
  - “ChooseAMovie Hub” on group hub pages.
- Keep helper text short and practical.

## Definition of done for a UX change
- No console hydration errors.
- Mobile view looks intentional (stacked, readable).
- Host vs member controls are correct.
- Refresh does not lose progress where specified.
- Build passes: `npm run build`.
