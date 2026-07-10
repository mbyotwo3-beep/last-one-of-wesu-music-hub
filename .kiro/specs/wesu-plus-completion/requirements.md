# Requirements Document

## Introduction

WESU+ is a Zambian music streaming and artist monetization platform built with TanStack Start and Supabase. The platform supports four roles: listener (user), artist, admin, and superadmin. All core backend workflows — auth, artist applications, song upload/moderation, purchases, subscriptions, collaborations, labels, revenue splits, payouts, and featured slots — are already implemented.

This feature spec covers the remaining work needed to complete WESU+ as a shippable Capacitor (Android) mobile app. The four major gaps are:

1. **Audio playback** — the PlayerBar UI exists with Zustand state but the `getSignedAudioUrl` server function is not connected to any HTML audio element. No actual sound plays. _(Fix shipped: PlayerBar now wires a singleton `<audio>` element to Zustand via `getSignedAudioUrl` / `getPublicAudioUrl`.)_
2. **Song upload failing** — storage RLS policies had a path-prefix conflict between `artist_id` (old migration) and `user_id` (new migration / `uploadFileToBucket`). _(Fix shipped: migration `20260623000000` drops conflicting policies.)_
3. **Anonymous & free-listener access** — Unauthenticated visitors should be able to browse and play **free** songs without signing in, but with an ad banner. Free registered listeners also see ads. _(Fix shipped: `getPublicAudioUrl` server fn + ad banner in PlayerBar.)_
4. **DPO Pay** — the `initiatePayment` server function is a stub. The live DPO Pay API call (`createToken`) is not wired, and there is no webhook handler to mark transactions as paid.
5. **Mobile-native shell** — Capacitor is configured but no native-feel mobile components exist. The app uses only the web navbar and web layouts on Android. Navigation, player, and all role workflows need mobile-appropriate UI.

---

## Glossary

- **App**: The WESU+ Capacitor Android application (and web SPA sharing the same codebase).
- **AudioEngine**: The client-side module responsible for managing the HTML `<audio>` element, requesting signed URLs, and synchronising playback state with the Zustand player store.
- **PlayerBar**: The existing fixed bottom bar component (`src/components/PlayerBar.tsx`) that shows track info and playback controls.
- **MiniPlayer**: A compact, swipeable bottom sheet native-feel player for the mobile layout.
- **BottomTabBar**: A native-feel fixed bottom tab navigation component rendered on Android/iOS (platform === 'native').
- **MobileShell**: The top-level layout wrapper rendered when `usePlatform() === 'native'`, replacing the web Navbar with the BottomTabBar.
- **DPO_Pay**: The DPO Pay payment gateway (https://pay.dpo.group) used for subscription and song/album purchases in Zambia.
- **Webhook**: An HTTP POST callback endpoint that DPO Pay calls to confirm or cancel a transaction.
- **SignedURL**: A time-limited Supabase Storage URL generated server-side by `getSignedAudioUrl`, granting access to a protected audio file.
- **Zustand_Store**: The `usePlayer` Zustand store at `src/stores/player.ts` holding current track, playing state, and progress.
- **RoleGate**: The existing `<RoleGate require="…">` component that restricts route access by role.
- **Listener**: A registered user with the `user` role who browses and plays music.
- **Artist**: A user with the `artist` role who uploads songs and manages earnings.
- **Admin**: A user with the `admin` role who moderates content and artist applications.
- **Superadmin**: A user with the `superadmin` role who manages the platform, payment config, payouts, and roles.
- **Platform**: Either `'native'` (Capacitor on Android/iOS) or `'web'` (browser), detected via `usePlatform()`.
- **SafeArea**: The device inset areas (status bar, home indicator) that must not be obscured by UI.

---

## Requirements

### Requirement 1: Audio Playback — Wiring the AudioEngine

**User Story:** As a Listener, I want to tap a song and hear it play immediately, so that I can stream music from WESU+.

#### Acceptance Criteria

1. WHEN the Listener selects a song, THE AudioEngine SHALL call `getSignedAudioUrl` with the song's id and load the returned signed URL into the HTML audio element within 2 seconds on a stable connection.
2. WHEN the signed URL is successfully loaded, THE AudioEngine SHALL begin playback automatically and set `playing: true` in the Zustand_Store.
3. WHEN the Listener taps the play/pause control in the PlayerBar, THE AudioEngine SHALL toggle the HTML audio element's playback state and update `playing` in the Zustand_Store accordingly.
4. WHILE a track is playing, THE AudioEngine SHALL update `progressSeconds` in the Zustand_Store at least once per second to reflect the current playback position.
5. WHEN the Listener seeks by interacting with the progress bar, THE AudioEngine SHALL set the HTML audio element's `currentTime` to the seeked position.
6. WHEN the HTML audio element emits an `ended` event, THE AudioEngine SHALL set `playing: false` in the Zustand_Store and call the `incrementPlayCount` server function for the finished track.
7. WHEN `getSignedAudioUrl` returns an error (song not found, access denied, network failure), THE App SHALL display an inline error message within the PlayerBar and set `playing: false`.
8. WHEN the Listener adjusts the volume slider, THE AudioEngine SHALL set the HTML audio element's volume to the chosen level between 0 and 1 inclusive.
9. THE AudioEngine SHALL persist in the DOM for the lifetime of the App session (singleton pattern), so that navigating between routes does not interrupt playback.
10. WHEN a new track is set via `setTrack` in the Zustand_Store, THE AudioEngine SHALL stop any currently playing track, release the previous source, and load the new SignedURL.

---

### Requirement 2: Audio Playback — Play Count & Access Control

**User Story:** As an Artist, I want my play counts to increase accurately, and as a Listener I want access control enforced so paid songs require a subscription or purchase.

#### Acceptance Criteria

1. WHEN a track finishes playing (audio `ended` event), THE App SHALL call an `incrementPlayCount` server function that increments the `songs.play_count` column by 1 for the finished song.
2. WHEN `getSignedAudioUrl` is called for a song with `price > 0`, THE Server SHALL verify the requesting user has an active subscription OR an existing purchase record for that song before returning a SignedURL.
3. IF the user has neither an active subscription nor a purchase for a paid song, THEN THE Server SHALL return a 403-equivalent error with the message "Subscribe or purchase to play full track".
4. THE `incrementPlayCount` server function SHALL require authenticated access (middleware: `requireSupabaseAuth`) to prevent anonymous abuse.
5. WHEN a free song (`price = 0` or `price IS NULL`) is requested, THE Server SHALL return a SignedURL without checking subscription or purchase status.

---

### Requirement 3: Anonymous & Free Listener Playback with Ads

**User Story:** As a visitor who hasn't signed up, I want to browse and play free songs without creating an account, so I can discover music on WESU+ before committing.

**User Story:** As a free registered listener, I expect ads to show since I'm not paying for premium, but I can still listen.

#### Acceptance Criteria

1. WHEN an unauthenticated visitor taps a free song (`price = 0`), THE App SHALL call `getPublicAudioUrl` (no auth required) and begin playback with an ad banner displayed in the PlayerBar.
2. WHEN an unauthenticated visitor attempts to play a paid song (`price > 0`), THE App SHALL display a prompt to sign up or subscribe, and SHALL NOT attempt playback.
3. THE PlayerBar SHALL display an ad banner strip WHEN the current listener is unauthenticated OR is a free registered user without an active subscription.
4. THE ad banner SHALL include a call-to-action: "Sign up free" link to `/auth` for unauthenticated users, or "Go Premium" link to `/subscriptions` for free registered users.
5. WHEN a premium subscriber plays music, THE App SHALL hide all ad banners.
6. THE home page, browse page, and artist pages SHALL be fully accessible to unauthenticated visitors without requiring sign-in.
7. WHEN an unauthenticated visitor navigates to an auth-required route (dashboard, artist-studio, admin, checkout), THE App SHALL redirect to `/auth`.

---

### Requirement 4: Song Upload Fix

**User Story:** As an Artist, I want my song uploads to succeed reliably so that my music appears in the moderation queue.

#### Acceptance Criteria

1. WHEN an Artist selects an audio file and submits the upload form, THE App SHALL upload the file to `song-audio` using the path `{user_id}/{timestamp}-{filename}` and receive a successful response.
2. THE storage RLS policy for `song-audio` SHALL allow authenticated users to upload to their own `user_id`-prefixed folder (matching `uploadFileToBucket`'s path format).
3. WHEN the storage upload succeeds, THE `uploadSong` server function SHALL insert the song with `status: 'pending'` and return the new `id`.
4. WHEN the upload fails, THE App SHALL display the specific Supabase error message to the artist.
5. Cover art uploads SHALL use the `album-art` bucket with the same `{user_id}/{timestamp}-{filename}` pattern.

---

### Requirement 5: DPO Pay Integration — Payment Token Creation

**User Story:** As a Listener, I want to pay for subscriptions and songs using Zambian mobile money or card, so that my purchases are processed in real time.

#### Acceptance Criteria

1. WHEN the Listener submits the checkout form with a valid `method_code` and `amount`, THE `initiatePayment` server function SHALL call the DPO Pay `createToken` API endpoint (`POST https://secure.3gdirectpay.com/API/v6/`) with the correct XML payload including `CompanyToken`, `ServiceType`, `PaymentAmount`, `PaymentCurrency`, `CompanyRef`, and redirect URLs.
2. WHEN DPO Pay responds with `<Result>000</Result>`, THE `initiatePayment` function SHALL return `{ transactionId, paymentUrl }` where `paymentUrl` is the DPO Pay hosted payment page URL, and THE App SHALL redirect the Listener's browser/WebView to that URL.
3. WHEN `DPO_COMPANY_TOKEN` or `DPO_SERVICE_TYPE` environment variables are absent, THE `initiatePayment` function SHALL throw a server error with the message "Payment gateway not configured" rather than silently returning a stub response.
4. WHEN a mobile money method (`MTN_MOMO`, `AIRTEL_MONEY`, `ZAMTEL_KWACHA`) is selected, THE `initiatePayment` function SHALL include the user-supplied phone number in the DPO Pay payload's `PhoneNumber` field.
5. THE `initiatePayment` function SHALL record the `provider_token` returned by DPO Pay in the `payment_transactions.provider_token` column to enable webhook reconciliation.

---

### Requirement 6: DPO Pay Integration — Webhook & Transaction Confirmation

**User Story:** As a Superadmin, I want payment outcomes to be reflected automatically in the database, so that subscriptions and purchases activate without manual intervention.

#### Acceptance Criteria

1. THE App SHALL expose an HTTP POST endpoint at `/api/dpo/webhook` that receives DPO Pay's payment result notification.
2. WHEN the webhook endpoint receives a request, THE Webhook handler SHALL verify the request authenticity by checking the `CompanyToken` in the payload matches `DPO_COMPANY_TOKEN`.
3. WHEN a `PAYMENT_COMPLETED` result is received, THE Webhook handler SHALL update the corresponding `payment_transactions` row to `status: 'completed'` and invoke the `fulfillTransaction` function.
4. WHEN `fulfillTransaction` is called for an `item_type: 'subscription'`, THE Server SHALL create or update the `subscriptions` row for the user with `status: 'active'` and set `expires_at` based on the plan's interval.
5. WHEN `fulfillTransaction` is called for an `item_type: 'song'` or `item_type: 'album'`, THE Server SHALL insert a row into `purchases` with `status: 'completed'` and trigger revenue split creation.
6. WHEN a `PAYMENT_FAILED` or `PAYMENT_CANCELLED` result is received, THE Webhook handler SHALL update the corresponding `payment_transactions` row to `status: 'failed'` or `status: 'cancelled'` respectively.
7. IF the webhook payload references an unknown `provider_token`, THEN THE Webhook handler SHALL respond with HTTP 200 and log a warning without throwing an error (to prevent DPO Pay retry storms).

---

### Requirement 5: Mobile Shell — BottomTabBar Navigation

**User Story:** As a mobile Listener, I want a native-feel bottom tab bar to navigate the app, so that the experience feels like a proper music app rather than a website.

#### Acceptance Criteria

1. WHILE `usePlatform() === 'native'`, THE App SHALL render a `BottomTabBar` component fixed at the bottom of the screen and hide the web `Navbar`.
2. THE BottomTabBar SHALL contain at minimum the following tabs: Home, Browse, Library (listener dashboard), and Profile — visible to all authenticated users.
3. WHEN the user holds an `artist` role, THE BottomTabBar SHALL display an additional "Studio" tab linking to the artist workflow.
4. WHEN the user holds an `admin` or `superadmin` role, THE BottomTabBar SHALL display an additional "Admin" tab linking to the appropriate admin panel.
5. WHILE `usePlatform() === 'native'`, THE App SHALL apply bottom safe-area inset padding so that the BottomTabBar is not obscured by the device home indicator.
6. WHEN the user is not authenticated, THE BottomTabBar SHALL show only Home and Browse tabs, with Library and Profile tabs directing the user to the `/auth` route.
7. THE BottomTabBar SHALL highlight the active tab using the `primary` colour token to indicate current location.

---

### Requirement 6: Mobile Shell — Status Bar & Safe Areas

**User Story:** As a mobile user, I want the app's UI to respect device safe areas, so that content is not cut off by the status bar, notch, or home indicator.

#### Acceptance Criteria

1. WHEN the App launches on a native platform, THE App SHALL call `StatusBar.setStyle({ style: Style.Dark })` using `@capacitor/status-bar` to set a light status bar text colour on the dark background.
2. WHEN the App launches on a native platform, THE App SHALL call `StatusBar.setBackgroundColor({ color: '#0a0a0f' })` to match the `obsidian` background colour.
3. THE MobileShell SHALL apply CSS `env(safe-area-inset-top)` padding to the top of the content area so that content begins below the status bar.
4. THE MobileShell SHALL apply CSS `env(safe-area-inset-bottom)` padding to the bottom of the content area above the BottomTabBar so that the last scroll item is not obscured.
5. WHEN the device orientation changes, THE MobileShell SHALL re-apply safe-area insets without requiring an app restart.

---

### Requirement 7: Mobile Shell — MiniPlayer

**User Story:** As a mobile Listener, I want a persistent mini player above the bottom tab bar so I can control playback while navigating.

#### Acceptance Criteria

1. WHILE a track is loaded in the Zustand_Store (`track !== null`) AND `usePlatform() === 'native'`, THE App SHALL render a MiniPlayer bar above the BottomTabBar.
2. THE MiniPlayer SHALL display the track cover art (or a placeholder music note icon), track title (truncated to one line), and artist name.
3. THE MiniPlayer SHALL include a play/pause button that calls `togglePlay` in the Zustand_Store and toggles the AudioEngine accordingly.
4. THE MiniPlayer SHALL include a skip-forward button that advances to the next track in the active queue.
5. WHEN the Listener taps the MiniPlayer track info area (not a control button), THE App SHALL navigate to a full-screen NowPlaying view.
6. WHILE a track is loading (signed URL request in-flight), THE MiniPlayer SHALL display a loading spinner in place of the play/pause button.

---

### Requirement 8: Mobile Layout — Home Screen

**User Story:** As a mobile Listener, I want a mobile-optimised home screen with vertically scrollable content sections, so that the app feels native rather than a shrunk-down website.

#### Acceptance Criteria

1. WHILE `usePlatform() === 'native'`, THE App SHALL render a `MobileHome` component instead of the web `HomePage`.
2. THE MobileHome SHALL include a horizontally scrollable "Featured" carousel showing featured albums from the `getFeaturedAlbums` server function.
3. THE MobileHome SHALL include a vertically stacked "New Releases" list showing at most 10 tracks, each tappable to trigger playback via `setTrack`.
4. THE MobileHome SHALL include a "Trending" section showing the top 5 songs by `play_count`.
5. THE MobileHome SHALL include a "Go Premium" promotional card linking to `/subscriptions`.
6. WHEN the Listener taps a song row, THE AudioEngine SHALL be invoked as defined in Requirement 1 acceptance criteria 1.

---

### Requirement 9: Mobile Layout — Browse & Search

**User Story:** As a mobile Listener, I want a search-first browse screen with genre filters, so that I can quickly find music on mobile.

#### Acceptance Criteria

1. WHILE `usePlatform() === 'native'`, THE App SHALL render a `MobileBrowse` component that places the search input at the top of the screen with a prominent touch target (minimum 44×44 pt).
2. THE MobileBrowse SHALL call `searchSongs` with the typed query and debounce requests by 300 ms to avoid excessive server calls.
3. THE MobileBrowse SHALL display genre filter chips (extracted from distinct genres in the result set) below the search input that filter the displayed song list.
4. WHEN a song row is tapped, THE AudioEngine SHALL load and play that song as defined in Requirement 1.
5. THE MobileBrowse song list SHALL render in a single-column layout with cover art, title, artist, and price on each row.

---

### Requirement 10: Mobile Layout — Listener Library (Dashboard)

**User Story:** As a mobile Listener, I want to see my playlists, purchases, and subscription status in a scrollable library screen.

#### Acceptance Criteria

1. WHILE `usePlatform() === 'native'`, THE App SHALL render a `MobileLibrary` component instead of the web `DashboardPage`.
2. THE MobileLibrary SHALL display the user's active subscription plan (or "Free" if none) in a prominent banner at the top.
3. THE MobileLibrary SHALL list all of the user's playlists with a tappable row navigating to a playlist detail view.
4. THE MobileLibrary SHALL list the user's 10 most recent purchases.
5. THE MobileLibrary SHALL include a "Create Playlist" button that opens a bottom sheet form using the `createPlaylist` server function.
6. WHEN a playlist row is tapped, THE App SHALL navigate to a `MobilePlaylistDetail` view showing all songs in that playlist, each tappable to trigger playback.

---

### Requirement 11: Mobile Layout — Artist Studio

**User Story:** As a mobile Artist, I want to access all artist tools (upload, albums, payouts, collaborators) in a native-feel tabbed interface on mobile.

#### Acceptance Criteria

1. WHILE `usePlatform() === 'native'`, THE Artist Studio route SHALL render a `MobileArtistStudio` component that uses a bottom-sheet tab switcher or segmented control instead of the web pill tabs.
2. THE MobileArtistStudio SHALL expose the same six tabs as the web studio: Upload Song, Albums, Collaborators, Label, Features, Payouts.
3. WHEN the Artist taps "Upload Song" on mobile, THE App SHALL open the device's file picker via the standard HTML `<input type="file" accept="audio/*">` element for audio selection.
4. THE MobileArtistStudio Payouts tab SHALL display the artist's available ZMW balance and a payout request form with mobile-optimised number and destination inputs.
5. THE MobileArtistStudio Albums tab SHALL allow creating new albums and listing existing albums in a vertically scrollable grid.
6. THE MobileArtistStudio Collaborators tab SHALL allow searching for artists and sending collaboration invites with role and split percentage as defined in the web studio.

---

### Requirement 12: Mobile Layout — Full-Screen Now Playing View

**User Story:** As a mobile Listener, I want a full-screen Now Playing view with large artwork and playback controls, consistent with native music app conventions.

#### Acceptance Criteria

1. WHEN the Listener taps the MiniPlayer track info, THE App SHALL navigate to a `NowPlayingScreen` that fills the full screen.
2. THE NowPlayingScreen SHALL display the track cover art at a minimum 280×280 pt size, track title, artist name, and the current album name if applicable.
3. THE NowPlayingScreen SHALL include a seek slider that reflects `progressSeconds` from the Zustand_Store and allows seeking as defined in Requirement 1 acceptance criteria 5.
4. THE NowPlayingScreen SHALL include play/pause, skip-back, and skip-forward controls.
5. THE NowPlayingScreen SHALL include a heart/like toggle that calls the `toggleLike` server function and persists to `song_likes`.
6. THE NowPlayingScreen SHALL display elapsed and total duration labels.
7. WHEN the Listener swipes down on the NowPlayingScreen, THE App SHALL dismiss it and return to the previous route.

---

### Requirement 13: Mobile Layout — Profile Screen

**User Story:** As a mobile user, I want a profile screen where I can view and edit my details, switch to my artist portal, and sign out.

#### Acceptance Criteria

1. WHILE `usePlatform() === 'native'`, THE App SHALL render a `MobileProfile` component reachable from the BottomTabBar.
2. THE MobileProfile SHALL display the user's avatar, display name, email, and current role badge.
3. THE MobileProfile SHALL include a form for editing `full_name`, `bio`, and `location` using the `updateProfile` server function.
4. WHEN the user holds the `artist` role, THE MobileProfile SHALL display a shortcut to the Artist Studio.
5. THE MobileProfile SHALL include a "Sign Out" button that calls `supabase.auth.signOut()` and redirects to the home route.
6. THE MobileProfile SHALL include a "Manage Subscription" link navigating to `/subscriptions`.

---

### Requirement 14: Mobile Layout — Admin Panel (Mobile-Adapted)

**User Story:** As a mobile Admin or Superadmin, I want the moderation and management workflows to be accessible on mobile, so that I can approve content while away from a desktop.

#### Acceptance Criteria

1. WHILE `usePlatform() === 'native'` AND the user has the `admin` or `superadmin` role, THE App SHALL render a `MobileAdmin` component reachable from the BottomTabBar.
2. THE MobileAdmin SHALL present moderation queues (pending songs, pending artists, pending labels) as vertically scrollable card lists.
3. WHEN an Admin taps "Approve" or "Reject" on a moderation card, THE App SHALL call the corresponding `moderateSong`, `moderateArtist`, or `moderateLabel` server function and remove the card from the list on success.
4. THE MobileAdmin SHALL display platform overview stats (total users, total songs, premium subscribers, 30-day revenue) in a 2×2 card grid at the top of the screen.
5. WHILE `usePlatform() === 'native'` AND the user has the `superadmin` role, THE MobileAdmin SHALL also include a Payouts tab listing pending payout requests with approve/reject actions.

---

### Requirement 15: Checkout & Subscription — Mobile-Optimised Flow

**User Story:** As a mobile Listener, I want a streamlined payment flow optimised for touch, so that I can subscribe or purchase a song without frustration on a small screen.

#### Acceptance Criteria

1. WHILE `usePlatform() === 'native'`, THE Checkout route SHALL render a `MobileCheckout` component that presents payment method options as large, tappable cards (minimum 64 pt height).
2. THE MobileCheckout SHALL use `type="tel"` inputs for phone number fields and display a numeric keyboard automatically on Android.
3. WHEN the `initiatePayment` function returns a `paymentUrl`, THE App SHALL open the URL in an in-app browser using `@capacitor/browser` rather than replacing the app's WebView.
4. WHEN the in-app browser is dismissed, THE App SHALL re-check the `payment_transactions` status for the pending transaction and display a success or pending state to the user.
5. THE Subscriptions listing page SHALL render subscription plan cards in a full-width, vertically stacked layout on mobile, with a clear "Subscribe" CTA button on each card.

---

### Requirement 16: Background Audio Playback

**User Story:** As a mobile Listener, I want music to continue playing when I switch to another app or lock the screen, so that I get an uninterrupted listening experience.

#### Acceptance Criteria

1. WHEN the App moves to the background on Android, THE AudioEngine SHALL continue playing audio uninterrupted.
2. WHEN the App moves to the background, THE App SHALL register a `@capgo/native-audio` (or equivalent Capacitor audio plugin) session so that the OS does not kill the audio stream.
3. WHEN the device lock screen or notification shade is visible, THE App SHALL display a media notification with track title, artist name, and cover art, along with play/pause and next controls.
4. WHEN the user taps play/pause in the notification, THE AudioEngine SHALL respond by toggling playback and updating the Zustand_Store.
5. WHERE `@capgo/native-audio` or an equivalent plugin is not installed, THE App SHALL fall back to the HTML `<audio>` element without crashing, and background audio behaviour will be subject to browser/WebView limitations.

---

### Requirement 17: Offline & Network Resilience

**User Story:** As a mobile Listener on an intermittent Zambian mobile data connection, I want the app to handle poor connectivity gracefully, so that it doesn't crash or show blank screens.

#### Acceptance Criteria

1. WHEN a network request fails due to connectivity loss, THE App SHALL display a user-friendly inline error message rather than an unhandled exception screen.
2. WHEN the signed URL request fails due to a network error, THE AudioEngine SHALL retry up to 2 additional times with a 1-second delay between attempts before surfacing an error to the user.
3. WHEN route data (songs, artists, albums) fails to load, THE App SHALL display a "Could not load content — tap to retry" message with a retry button that re-triggers the query.
4. THE App SHALL cache the last successful response of `getNewReleases`, `getTrendingSongs`, and `getFeaturedAlbums` in TanStack Query's in-memory cache with a `staleTime` of 5 minutes, so that the home screen renders immediately on re-visits within a session.
5. WHEN `@capacitor/preferences` is available, THE App SHALL persist the last known user profile and active subscription status to device preferences so that the profile screen shows meaningful data even when offline.

---

### Requirement 18: Authentication — Native Deep Link & Session Persistence

**User Story:** As a mobile user, I want my login session to persist between app launches and for OAuth deep links to work correctly on Android, so that I don't have to sign in every time.

#### Acceptance Criteria

1. WHEN the App launches on Android, THE Supabase client SHALL restore the persisted session from `localStorage` (Capacitor's WebView retains localStorage between launches) without requiring the user to sign in again.
2. WHEN the user signs in via email/password, THE App SHALL store the Supabase session token and refresh it silently when it expires, without presenting a sign-in screen.
3. WHEN a Supabase magic-link or OAuth redirect URL is opened on Android, THE App SHALL handle the deep link using the `com.wesu.music://` URL scheme and complete the auth flow without leaving the app.
4. THE Capacitor `appId` SHALL remain `com.wesu.music` and the Android intent filter SHALL include the `com.wesu.music` custom scheme for deep link handling.
5. WHEN the user signs out, THE App SHALL clear the Supabase session and navigate to the home route on both web and native platforms.

---

### Requirement 19: Role-Based Navigation Completeness

**User Story:** As any user of any role, I want every workflow I'm entitled to be reachable from the mobile navigation, so that no feature is hidden or inaccessible on mobile.

#### Acceptance Criteria

1. THE App SHALL ensure every route that exists on web (home, browse, artists, albums, subscriptions, dashboard, profile, artist-dashboard, artist-studio, collabs, label-dashboard, apply-label, admin, superadmin, checkout, auth) is also reachable on native via the BottomTabBar, a deep link, or a contextual navigation action.
2. WHEN a Listener navigates to a route protected by `<RoleGate>` without the required role, THE App SHALL redirect to the home route with an appropriate toast message instead of rendering a blank error screen.
3. THE BottomTabBar SHALL dynamically render tabs based on the user's roles as returned by `useUserRoles()`, with no hardcoded role assumptions.
4. WHEN a user's role changes (e.g., artist application approved), THE App SHALL reflect the updated role in the BottomTabBar without requiring a full app restart — a session refresh (re-fetch of `user_roles`) SHALL be sufficient.
5. THE App SHALL preserve the TanStack Router navigation history stack so that the Android back button behaves correctly, navigating to the previous route rather than exiting the app on the first back press.

---

### Requirement 20: Accessibility on Mobile

**User Story:** As a user with accessibility needs, I want all interactive elements to be operable by Android TalkBack and to have sufficiently large touch targets.

#### Acceptance Criteria

1. THE BottomTabBar tabs SHALL each have an `aria-label` attribute describing the destination (e.g., "Home", "Browse music", "My library", "My profile").
2. THE MiniPlayer play/pause button SHALL have an `aria-label` of "Play" or "Pause" that updates dynamically to reflect the current state.
3. ALL interactive touch targets in the mobile layout SHALL have a minimum size of 44×44 CSS pixels to meet WCAG 2.1 SC 2.5.5 (Target Size).
4. THE NowPlayingScreen seek slider SHALL have appropriate `aria-valuemin`, `aria-valuemax`, and `aria-valuenow` attributes that update as the track progresses.
5. THE App SHALL not rely solely on colour to convey information (e.g., active tab state SHALL also use a label or icon change, not colour alone).
