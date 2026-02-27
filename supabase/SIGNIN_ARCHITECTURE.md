# Sign-In Architecture Plan

This plan adds account identity without breaking the existing anonymous join flow.

## Goals
- Keep current invite-link flow working (`/g/{groupId}` + quick join).
- Introduce durable user identities (email/OAuth) for persistence across devices.
- Support migration from anonymous sessions to permanent accounts.
- Avoid schema churn by using additive changes.

## Current state
- The app authenticates with Supabase anonymous auth.
- Group ownership and membership are keyed by `auth.uid()`.
- "Sign in" page is currently a management placeholder.

## Phase 1: Data foundation (completed in migration)
- Added `public.profiles` for durable account metadata.
- Added `public.group_invites` to support future revocable invite links/codes.
- Added `upsert_my_profile(...)` RPC for profile bootstrap/update.
- Added lifecycle columns (`updated_at`, `last_activity_at`, membership status fields).

## Phase 2: Auth UX and session model
- Add real sign-in actions in UI (email magic link + OAuth provider).
- Keep anonymous auth as default "guest" mode.
- On successful sign-in, call `upsert_my_profile(...)`.
- Surface profile state in app shell (signed-in user vs guest).

## Phase 3: Anonymous-to-account migration
- When a guest signs in, migrate their rows by matching prior anonymous `auth.uid()`:
  - `members.user_id`
  - `groups.owner_user_id`
- Strategy:
  - Prefer Supabase account-linking when available.
  - Fallback RPC to transfer ownership/membership from anonymous user to authenticated user for the same client session.

## Phase 4: Invite modernization
- Generate invite codes from `group_invites` instead of relying only on group UUID.
- Add invite expiration/revocation and max-use limits.
- Update join flow to accept either legacy group-id code or new invite code.

## Phase 5: Security hardening
- Tighten RLS around `title_cache` writes if abuse appears.
- Restrict direct group joins to active invite code if product no longer wants "groupId as join token".
- Add audit fields for moderation and abuse controls.

## API/RPC additions to implement next
- `create_group_invite(p_group_id uuid, p_expires_at timestamptz, p_max_uses int)`
- `revoke_group_invite(p_invite_id uuid)`
- `join_group_via_invite(p_code text, p_name text)`
- `transfer_account_ownership_from_anonymous(...)` (if needed for merge path)

## Frontend additions to implement next
- `src/lib/authClient.ts` wrapper for:
  - `signInWithOtp`
  - OAuth sign-in
  - `signOut`
  - profile bootstrap
- Upgrade `/signin` page from placeholder to real auth controls.
- Add account indicator in `AppShell`.

## Backward compatibility guarantees
- Existing groups and ratings remain valid.
- Existing `/g/{groupId}` links still work.
- Existing anonymous sessions remain supported.
