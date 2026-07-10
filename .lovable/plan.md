
This is a large scope. I'll ship it in three phases so you can review after each. Approving this plan starts Phase 1 only — I'll pause between phases so you can test.

## Phase 1 — Auth, roles, and artist workflow (ship first)

Goal: any new user can sign up, apply as an artist, get approved by an admin, and immediately upload music. Password reset works. Email links go to the right domain.

- **Approval grants the `artist` role.** Add a DB trigger on `artists` so that when `status` flips to `approved`, a `user_roles` row `(user_id, 'artist')` is inserted. Today approval only sets a flag — the artist can't upload because they don't have the role. This is the single biggest blocker.
- **Password reset flow.** Add `/forgot-password` and `/reset-password` public routes. Wire `supabase.auth.resetPasswordForEmail` with `redirectTo: https://www.wesuplusly.com/reset-password`, and the reset page calls `updateUser({ password })`.
- **Email redirect domain.** All `emailRedirectTo` and `redirectTo` in code hardcoded to `https://www.wesuplusly.com/*`. I'll also give you the exact 2-click change to make in the backend Site URL setting (I can't change that from code).
- **Artist dashboard status clarity.** Already partly done — verify Pending / Rejected / Approved states render correctly and the "Upload" area only appears after the role is granted.
- **Fix "only 2 artists".** Not a bug — 3 of your 5 artists are still `pending`. I'll add an admin "Pending artist applications" list so you can approve them in one click.
- **Remove the "claim superadmin" button** from the profile (you mentioned it errors and it's already claimed).

## Phase 2 — Spotify-style search

- **Global search bar** in the top nav (desktop) and top of Browse (mobile).
- **Instant results dropdown** — 300ms debounce, hits Songs / Artists / Albums grouped, keyboard nav, click a result → play song or navigate.
- **Dedicated `/search` page** with tabs: All · Songs · Artists · Albums · Playlists. Search term in URL (`?q=`) so results are shareable.
- Backend: one `globalSearch({ q })` server fn that returns `{ songs, artists, albums, playlists }` filtered by approved/published status only.

## Phase 3 — Admin CMS (scoped realistically)

A true "drag any component onto any page" builder is a multi-week product on its own. I'll ship the 80% version that gives you real control without a fragile builder:

- **Homepage section manager** (`/admin/homepage`): drag to reorder shelves (Hero, Featured Albums, New Releases, Trending, Genre rows). Toggle visible/hidden. Rename titles. Stored in a new `homepage_sections` table.
- **Featured content picker** (`/admin/featured`): search-and-pick which albums/artists/songs fill each Featured slot. Backed by the existing `featured_slots` table.
- **Navigation editor** (`/admin/navigation`): edit the label, icon, URL, order, and visibility of top-nav and sidebar items. New `nav_items` table with `location` (`nav` | `sidebar` | `mobile_tabs`).
- Frontend reads these tables via cached server fns; changes appear immediately after save.

**What I'm NOT building in Phase 3** (say the word if you want it and I'll scope separately):
- Free-form drag-any-block-onto-any-page builder (Webflow/Framer-style). Realistically 2–3 more phases of work and adds a lot of surface area to maintain.

## Technical notes

- New tables: `homepage_sections`, `nav_items`. Both admin-write, public-read with narrow `TO anon` SELECT policies.
- New DB trigger: `after_artist_approved` → inserts `user_roles(user_id, 'artist')` on status transition to `approved` (idempotent).
- New server fns: `globalSearch`, `getHomepageSections`, `getNavItems`, `updateHomepageSection`, `updateNavItem`, `pickFeaturedSlot`.
- Drag-and-drop: `@dnd-kit/core` + `@dnd-kit/sortable` (small, accessible, already React 19 compatible).
- Password reset: two new public routes, no changes to `_authenticated`.
- No changes to payments, DPO webhook, or existing RLS policies beyond what's listed.

Reply "go" and I'll start Phase 1.
