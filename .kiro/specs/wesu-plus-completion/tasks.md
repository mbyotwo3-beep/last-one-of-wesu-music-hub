# Implementation Plan: WESU+ Completion

## Overview

Complete the WESU+ Capacitor Android music streaming app. Core audio engine, storage RLS fixes, and anonymous playback are already shipped. Remaining work covers DPO Pay wiring, the full mobile shell (MobileShell → screen components → route branching), network resilience, deep-link auth, role-gate redirect fix, and property-based test coverage.

---

## Tasks

- [x] 1. Audio Engine (already shipped)
  - [x] 1.1 Singleton AudioEngine in PlayerBar.tsx — HTMLAudioElement, signed URL load, retry logic, progress tracking, volume
    - _Requirements: 1.1–1.10_
  - [x] 1.2 getSignedAudioUrl + getPublicAudioUrl + incrementPlayCount server functions in listener.functions.ts
    - _Requirements: 2.1–2.5, 3.1_
  - [x] 1.3 Ad banner in PlayerBar for anonymous / free users
    - _Requirements: 3.3, 3.4, 3.5_
  - [x] 1.4 Migration 20260623000000 — storage RLS fix + approved-only anon song policy + increment_play_count DB function
    - _Requirements: 4.1, 4.2, 2.1_

---

- [x] 2. DPO Pay — createToken integration
  - [x] 2.1 Replace stub in payments.functions.ts with real DPO Pay createToken XML call
    - Build XML payload with CompanyToken, ServiceType, PaymentAmount, PaymentCurrency, CompanyRef, RedirectURL, BackURL, PTL, and optional PhoneNumber
    - Parse `<Result>` and `<TransToken>` from response (regex extract — no extra parser dep)
    - On result 000: update `payment_transactions.provider_token`, return `{ transactionId, paymentUrl }`
    - On non-000 result: throw with DPO error message, leave transaction as pending
    - Throw `"Payment gateway not configured"` when DPO_COMPANY_TOKEN or DPO_SERVICE_TYPE env vars are absent
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 2.2 Write property test for DPO payload completeness (Property 7)
    - **Property 7: DPO Pay payload completeness**
    - **Validates: Requirements 5.1, 5.4**

  - [x] 2.3 Write property test for missing env vars (Property 8)
    - **Property 8: Missing DPO env vars throw configuration error**
    - **Validates: Requirements 5.3**

  - [x] 2.4 Write property test for provider_token persistence (Property 9)
    - **Property 9: DPO provider_token persisted after successful createToken**
    - **Validates: Requirements 5.5**

---

- [x] 3. DPO Pay — webhook endpoint + fulfillTransaction
  - [x] 3.1 Create migration 20260624000000_dpo_webhook_idempotency.sql
    - `CREATE INDEX IF NOT EXISTS idx_payment_transactions_provider_token ON public.payment_transactions (provider_token) WHERE provider_token IS NOT NULL`
    - _Requirements: 6.1_

  - [x] 3.2 Create src/routes/api/dpo/webhook.ts — POST /api/dpo/webhook handler
    - Verify CompanyToken from body matches DPO_COMPANY_TOKEN; return 401 on mismatch
    - Look up payment_transactions by provider_token; return 200 + warning log if not found
    - On CCDapproval === '000': UPDATE status='completed', call fulfillTransaction(tx)
    - On other CCDapproval: UPDATE status='failed' or 'cancelled'
    - Always return HTTP 200 to prevent DPO retry storms
    - _Requirements: 6.1, 6.2, 6.6, 6.7_

  - [x] 3.3 Create src/lib/payments.server.ts with fulfillTransaction helper
    - For item_type='subscription': upsert subscriptions row with status='active', expires_at=now+plan interval
    - For item_type='song' or 'album': insert purchases row with status='completed', trigger revenue split
    - _Requirements: 6.3, 6.4, 6.5_

  - [x] 3.4 Write property test for webhook CompanyToken verification (Property 10)
    - **Property 10: Webhook CompanyToken verification returns 401 on mismatch**
    - **Validates: Requirements 6.2**

  - [x] 3.5 Write property test for payment fulfillment state transitions (Property 11)
    - **Property 11: Payment fulfillment state transitions**
    - **Validates: Requirements 6.3, 6.4, 6.5**

  - [x] 3.6 Write property test for failed/cancelled payment status (Property 12)
    - **Property 12: Failed/cancelled payments update transaction status**
    - **Validates: Requirements 6.6**

  - [x] 3.7 Write unit tests for webhook endpoint
    - DPO unknown provider_token returns HTTP 200 without DB write (Req 6.7)
    - DPO webhook POST responds to requests (Req 6.1)

- [x] 4. Checkpoint — ensure all tests pass, ask the user if questions arise.

---

- [x] 5. RoleGate redirect fix
  - [x] 5.1 Update RoleGate.tsx to redirect to `/` with toast instead of rendering blank "Access denied" UI
    - Import and call `toast()` from sonner before navigating
    - Remove the Shield error JSX block; return null while redirecting
    - _Requirements: 19.2_

  - [x] 5.2 Write property test for RoleGate redirect (Property 24)
    - **Property 24: RoleGate violation redirects with toast**
    - **Validates: Requirements 19.2**

---

- [x] 6. Mobile shell — core layout components
  - [x] 6.1 Create src/components/mobile/StatusBarInit.tsx
    - Call StatusBar.setStyle({ style: Style.Dark }) and StatusBar.setBackgroundColor({ color: '#0a0a0f' }) in useEffect on mount
    - Return null (render-less component)
    - _Requirements: 6.1, 6.2_

  - [x] 6.2 Create src/components/mobile/BottomTabBar.tsx
    - Derive tab set from useUserRoles() at render time — no hardcoded role assumptions
    - Tabs: Home (/), Browse (/browse) always; Library (/dashboard), Profile (/profile) for authenticated; Studio (/artist-studio) for isArtist; Admin (/admin or /superadmin) for isAdmin/isSuperAdmin
    - Unauthenticated: Home + Browse only (Library/Profile redirect to /auth when tapped)
    - Active tab: text-primary + aria-current="page"; inactive: text-muted-foreground
    - Fixed bottom positioning with pb-[env(safe-area-inset-bottom)]
    - All tabs: min-h-[44px] min-w-[44px] touch targets + aria-label attribute
    - _Requirements: 5 (mobile nav req), 6.5, 19.3, 20.1_

  - [x] 6.3 Write property test for role-based tab derivation (Property 14)
    - **Property 14: Role-based tab set is dynamically derived**
    - **Validates: Requirements 7.3 (Req 5 AC3), 19.3**
    - Extract a pure `computeTabs(roles, isAuthenticated)` helper and test it directly

  - [x] 6.4 Write property test for unauthenticated BottomTabBar (Property 15)
    - **Property 15: Unauthenticated BottomTabBar shows only Home and Browse**
    - **Validates: Requirements 7.6 (Req 5 AC6)**

  - [x] 6.5 Create src/components/mobile/MiniPlayer.tsx
    - Read track, playing, togglePlay from Zustand; visible only when track !== null
    - Layout: fixed above BottomTabBar, h-16, cover art 40×40, title + artist truncated
    - Loading spinner when URL in-flight; play/pause button aria-label toggles "Play"/"Pause"
    - Tap info area → navigate to /now-playing
    - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.6, 20.2_

  - [x] 6.6 Write property test for MiniPlayer render (Property 16)
    - **Property 16: MiniPlayer renders correctly for any non-null track**
    - **Validates: Requirements 7.1, 7.2**

  - [x] 6.7 Create src/components/mobile/MobileShell.tsx
    - Renders StatusBarInit once on mount
    - Wraps children in pt-[env(safe-area-inset-top)] pb-[calc(env(safe-area-inset-bottom)+4rem+3.5rem)]
    - Renders MiniPlayer then BottomTabBar at bottom
    - _Requirements: 6 (safe areas req), 7.1_

  - [x] 6.8 Write property test for BottomTabBar/Navbar mutual exclusion (Property 13)
    - **Property 13: BottomTabBar renders on native, Navbar hidden**
    - **Validates: Requirements 5 AC1 (Req 7 in spec)**

---

- [x] 7. \_\_root.tsx — platform branching
  - [x] 7.1 Modify RootComponent in \_\_root.tsx to branch on usePlatform()
    - Import usePlatform, MobileShell
    - native: `<MobileShell><Outlet /></MobileShell>`
    - web: existing `<Navbar /><main><Outlet /></main><PlayerBar />`
    - _Requirements: 5 AC1, 6 AC1_

---

- [x] 8. NowPlayingScreen + /now-playing route
  - [x] 8.1 Create src/components/mobile/screens/NowPlayingScreen.tsx
    - Cover art min-h-[280px] min-w-[280px], title, artist, album name
    - Radix Slider seek: aria-valuemin=0, aria-valuemax=durationSeconds, aria-valuenow=progressSeconds, aria-label="Seek"
    - Elapsed/total duration labels; SkipBack, Play/Pause, SkipForward controls (all ≥44×44px)
    - Heart/like toggle calling toggleLike server fn
    - Swipe-down dismisses via router.history.back()
    - _Requirements: 12.1–12.7, 20.4_

  - [x] 8.2 Create src/routes/now-playing.tsx — modal route rendering NowPlayingScreen
    - _Requirements: 12.1_

  - [x] 8.3 Write property test for ARIA on interactive mobile components (Property 25)
    - **Property 25: ARIA labels present on interactive mobile components**
    - **Validates: Requirements 20.1, 20.2, 20.4**

---

- [x] 9. Mobile screen components
  - [x] 9.1 Create shared src/components/mobile/shared/SongRow.tsx
    - Reusable 44pt-height song list item: cover art, title, artist, price
    - Tap calls setTrack from Zustand
    - _Requirements: 8.3, 9.5_

  - [x] 9.2 Create shared src/components/mobile/shared/RetryBoundary.tsx
    - Wraps query-driven sections; on error shows "Could not load content — tap to retry"
    - Retry button calls queryClient.invalidateQueries(queryKey)
    - _Requirements: 17.1, 17.3_

  - [x] 9.3 Create src/components/mobile/screens/MobileHome.tsx
    - Featured horizontal carousel (embla-carousel-react) from getFeaturedAlbums
    - New Releases list (≤10 tracks) via SongRow + setTrack
    - Trending top-5 by play_count
    - Go Premium card → /subscriptions
    - Apply staleTime: 5*60*1000 on getNewReleases, getTrendingSongs, getFeaturedAlbums queryOptions
    - _Requirements: 8.1–8.6, 17.4_

  - [x] 9.4 Write property test for home data query staleTime (Property 21)
    - **Property 21: Home data queries respect 5-minute staleTime**
    - **Validates: Requirements 17.4**

  - [x] 9.5 Create src/components/mobile/screens/MobileBrowse.tsx
    - Search input at top (min 44×44pt), 300 ms debounce on searchSongs
    - Genre chip row filtering the result list
    - Single-column song list via SongRow
    - _Requirements: 9.1–9.5_

  - [x] 9.6 Create src/components/mobile/screens/MobileLibrary.tsx
    - Subscription banner (active plan or "Free")
    - Playlists list; Recent purchases list (10 most recent)
    - "Create Playlist" button → bottom sheet form using createPlaylist server fn
    - _Requirements: 10.1–10.5_

  - [x] 9.7 Create src/components/mobile/screens/MobileArtistStudio.tsx
    - Radix Tabs segmented control for 6 tabs: Upload, Albums, Collaborators, Label, Features, Payouts
    - Upload tab: `<input type="file" accept="audio/*">` for audio selection
    - Payouts tab: ZMW balance display + payout request form
    - _Requirements: 11.1–11.6_

  - [x] 9.8 Create src/components/mobile/screens/MobileProfile.tsx
    - Avatar, display name, email, role badge
    - Edit form (full_name, bio, location) calling updateProfile
    - Artist Studio shortcut if isArtist
    - Sign Out button → supabase.auth.signOut() → navigate to /
    - Manage Subscription link → /subscriptions
    - _Requirements: 13.1–13.6_

  - [x] 9.9 Write property test for sign out clears session (Property 22)
    - **Property 22: Sign out clears session**
    - **Validates: Requirements 18.5**

  - [x] 9.10 Create src/components/mobile/screens/MobileAdmin.tsx
    - 2×2 stats grid (total users, songs, premium subscribers, 30-day revenue)
    - Pending queues (songs/artists/labels) as card lists with Approve/Reject calling moderateSong/moderateArtist/moderateLabel
    - Superadmin: Payouts tab with pending payout requests
    - _Requirements: 14.1–14.5_

  - [x] 9.11 Create src/components/mobile/screens/MobileCheckout.tsx
    - Payment method options as large tappable cards (≥64pt height)
    - type="tel" for phone number inputs
    - On paymentUrl returned: open with @capacitor/browser
    - On browser dismiss: re-check payment_transactions status
    - _Requirements: 15.1–15.4_

- [x] 10. Checkpoint — ensure all tests pass, ask the user if questions arise.

---

- [x] 11. Route-level platform branching
  - [x] 11.1 Update src/routes/index.tsx to render MobileHome when platform === 'native'
    - _Requirements: 8.1_
  - [x] 11.2 Update src/routes/browse.tsx to render MobileBrowse when platform === 'native'
    - _Requirements: 9.1_
  - [x] 11.3 Update src/routes/dashboard.tsx to render MobileLibrary when platform === 'native'
    - _Requirements: 10.1_
  - [x] 11.4 Update src/routes/artist-studio.tsx to render MobileArtistStudio when platform === 'native'
    - _Requirements: 11.1_
  - [x] 11.5 Update src/routes/profile.tsx to render MobileProfile when platform === 'native'
    - _Requirements: 13.1_
  - [x] 11.6 Update src/routes/admin.tsx and superadmin.tsx to render MobileAdmin when platform === 'native'
    - _Requirements: 14.1_
  - [x] 11.7 Update src/routes/checkout.tsx to render MobileCheckout when platform === 'native'
    - _Requirements: 15.1_

  - [x] 11.8 Write property test for all web routes reachable on native (Property 23)
    - **Property 23: All web routes reachable on native**
    - **Validates: Requirements 19.1**

---

- [x] 12. Network resilience
  - [x] 12.1 Add @capacitor/preferences to package.json and create src/lib/offline-cache.ts
    - `cacheProfile(profile)` → Preferences.set; `getCachedProfile()` → Preferences.get + JSON.parse
    - Integrate into MobileProfile: load cached profile as initial data, update cache on successful fetch
    - _Requirements: 17.5_

  - [x] 12.2 Write property test for AudioEngine error state disables playback (Property 19)
    - **Property 19: AudioEngine error state disables playback**
    - **Validates: Requirements 1.7, 17.1**

  - [x] 12.3 Write property test for signed URL retry (Property 20)
    - **Property 20: Signed URL retry up to 2 additional attempts**
    - **Validates: Requirements 17.2**

---

- [x] 13. Deep link auth handler
  - [x] 13.1 Create src/integrations/supabase/auth-deep-link.ts with registerDeepLinkHandler()
    - App.addListener('appUrlOpen') → parse access_token + refresh_token from URL → supabase.auth.setSession()
    - _Requirements: 18.3, 18.4_

  - [x] 13.2 Register registerDeepLinkHandler() in \_\_root.tsx inside useEffect guarded by usePlatform() === 'native'
    - _Requirements: 18.3_

---

- [x] 14. Background audio (stretch goal)
  - [x] 14.1 Install @capgo/native-audio and create src/lib/native-audio.ts
    - preloadNative(id, url): NativeAudio.preload with isUrl=true; catch all errors silently (fall back to HTMLAudioElement)
    - _Requirements: 16.1, 16.2, 16.5_

  - [x] 14.2 Add FOREGROUND_SERVICE and FOREGROUND_SERVICE_MEDIA_PLAYBACK permissions to android/app/src/main/AndroidManifest.xml
    - _Requirements: 16.3_

  - [x] 14.3 In PlayerBar.tsx, delegate to NativeAudio.play() when platform === 'native' and plugin is available; keep HTMLAudioElement as fallback
    - Wire NativeAudio 'complete' event back to Zustand incrementPlayCount
    - _Requirements: 16.1, 16.2, 16.4, 16.5_

---

- [x] 15. Property-based test suite setup and remaining properties
  - [x] 15.1 Install fast-check as dev dependency: `npm install --save-dev fast-check`
    - Add vitest config if not present
    - _Requirements: testing strategy_

  - [x] 15.2 Write property test for access control on paid songs (Property 1)
    - **Property 1: Access control for paid songs**
    - **Validates: Requirements 2.2, 2.3**

  - [x] 15.3 Write property test for free song public URL (Property 2)
    - **Property 2: Free song public URL — no auth required**
    - **Validates: Requirements 2.5, 3.1**

  - [x] 15.4 Write property test for play count increment (Property 3)
    - **Property 3: Play count increment by exactly 1**
    - **Validates: Requirements 2.1**

  - [x] 15.5 Write property test for ad banner visibility rule (Property 4)
    - **Property 4: Ad banner visibility rule**
    - **Validates: Requirements 3.3, 3.5**

  - [x] 15.6 Write property test for auth-required route redirects (Property 5)
    - **Property 5: Auth-required routes redirect unauthenticated users**
    - **Validates: Requirements 3.7**

  - [x] 15.7 Write property test for upload inserts song with pending status (Property 6)
    - **Property 6: Upload inserts song with pending status**
    - **Validates: Requirements 4.3**

  - [x] 15.8 Write property test for play/pause toggle round trip (Property 17)
    - **Property 17: Play/pause toggle is a round trip**
    - **Validates: Requirements 1.3**

  - [x] 15.9 Write property test for seek sets audio currentTime (Property 18)
    - **Property 18: Seek sets audio currentTime proportionally**
    - **Validates: Requirements 1.5**

  - [x] 15.10 Write unit tests for specific examples
    - getPublicAudioUrl for paid song → throws correct message
    - incrementPlayCount requires auth
    - Ad banner CTA: anon shows "Sign up free" /auth; free user shows "Go Premium" /subscriptions
    - Storage upload with user_id prefix succeeds; artist_id prefix rejected
    - Cover art upload uses album-art bucket
    - DPO unknown provider_token returns HTTP 200 without DB write
    - StatusBar.setStyle and setBackgroundColor called on native launch
    - Tapping MiniPlayer track area navigates to /now-playing
    - MiniPlayer loading spinner shown when URL in-flight
    - Sign out navigates to /

- [x] 16. Final checkpoint — ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Already-completed tasks (group 1) are marked `[x]` — do not re-implement them
- Background audio (group 14) is a stretch goal; skip if timeline is tight
- Each task references specific requirements for traceability
- Property tests use fast-check with `numRuns: 100` minimum
- Each property test must include the comment: `// Feature: wesu-plus-completion, Property N: <text>`

---

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1.1", "1.2", "1.3", "1.4"]
    },
    {
      "wave": 2,
      "tasks": ["2.1", "2.2", "2.3", "2.4"]
    },
    {
      "wave": 3,
      "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7"]
    },
    {
      "wave": 4,
      "tasks": ["4"]
    },
    {
      "wave": 5,
      "tasks": ["5.1", "5.2"]
    },
    {
      "wave": 6,
      "tasks": ["6.1", "6.2", "6.3", "6.4", "6.5", "6.6", "6.7", "6.8"]
    },
    {
      "wave": 7,
      "tasks": ["7.1"]
    },
    {
      "wave": 8,
      "tasks": ["8.1", "8.2", "8.3"]
    },
    {
      "wave": 9,
      "tasks": ["9.1", "9.2", "9.3", "9.4", "9.5", "9.6", "9.7", "9.8", "9.9", "9.10", "9.11"]
    },
    {
      "wave": 10,
      "tasks": ["10"]
    },
    {
      "wave": 11,
      "tasks": ["11.1", "11.2", "11.3", "11.4", "11.5", "11.6", "11.7", "11.8"]
    },
    {
      "wave": 12,
      "tasks": ["12.1", "12.2", "12.3", "13.1", "13.2"]
    },
    {
      "wave": 13,
      "tasks": ["14.1", "14.2", "14.3"]
    },
    {
      "wave": 14,
      "tasks": ["15.1", "15.2", "15.3", "15.4", "15.5", "15.6", "15.7", "15.8", "15.9", "15.10"]
    },
    {
      "wave": 15,
      "tasks": ["16"]
    }
  ]
}
```
