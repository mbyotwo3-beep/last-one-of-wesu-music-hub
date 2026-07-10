# Design Document — WESU+ Completion

## Overview

WESU+ is a Zambian music streaming and artist monetization platform. This design covers the remaining work to ship the platform as a production-quality Capacitor (Android) app. The four major delivery areas are:

1. **Audio Engine hardening** — the singleton PlayerBar is wired; this design documents the pattern formally and ensures access control, play counts, and anonymous playback are correct.
2. **DPO Pay** — replacing the stub `initiatePayment` with real `createToken` calls and adding a `/api/dpo/webhook` endpoint for transaction fulfillment.
3. **Mobile shell** — a full native-feel UI layer (BottomTabBar, MiniPlayer, MobileShell, and screen-level mobile components) rendered when `usePlatform() === 'native'`.
4. **Platform completeness** — background audio, network resilience, deep-link auth, role-based navigation, and accessibility.

The design adheres to the existing stack: TanStack Start (React SSR), Supabase (PostgreSQL + Storage + Auth), Tailwind CSS v4, Capacitor v8, and Zustand.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          TanStack Router                        │
│  __root.tsx ──► RootComponent                                   │
│                 ├─ platform=web  → <Navbar /> + <PlayerBar />   │
│                 └─ platform=native → <MobileShell />            │
│                                      ├─ <StatusBarInit />       │
│                                      ├─ <Outlet /> (screens)   │
│                                      ├─ <MiniPlayer />          │
│                                      └─ <BottomTabBar />        │
└─────────────────────────────────────────────────────────────────┘

AudioEngine (singleton, module-level)
  ├─ HTMLAudioElement (module variable _audio)
  ├─ Zustand usePlayer store (track, playing, progressSeconds)
  └─ Server functions: getSignedAudioUrl / getPublicAudioUrl / incrementPlayCount

DPO Pay layer
  ├─ src/lib/payments.functions.ts  (initiatePayment — createToken call)
  ├─ src/routes/api/dpo/webhook.ts  (POST /api/dpo/webhook)
  └─ src/lib/payments.server.ts     (fulfillTransaction helper)

Mobile shell components
  src/components/mobile/
    ├─ MobileShell.tsx
    ├─ BottomTabBar.tsx
    ├─ MiniPlayer.tsx
    ├─ StatusBarInit.tsx
    ├─ screens/
    │   ├─ MobileHome.tsx
    │   ├─ MobileBrowse.tsx
    │   ├─ MobileLibrary.tsx
    │   ├─ MobileArtistStudio.tsx
    │   ├─ NowPlayingScreen.tsx
    │   ├─ MobileProfile.tsx
    │   ├─ MobileAdmin.tsx
    │   └─ MobileCheckout.tsx
    └─ shared/
        ├─ SongRow.tsx       (reusable 44pt-height song list item)
        └─ RetryBoundary.tsx (network error + retry UI)
```

---

## Components and Interfaces

### 1. AudioEngine (src/components/PlayerBar.tsx — already shipped)

The AudioEngine is **not** a class — it is a module-level singleton `HTMLAudioElement` (`_audio`) combined with the `usePlayer` Zustand store. `PlayerBar.tsx` owns the lifecycle via `useEffect` hooks. No separate file is needed.

**State machine:**

```
IDLE ──setTrack──► LOADING ──url resolved──► PLAYING
                       │                      │
                       └── error ──► ERROR    ├─ togglePlay ──► PAUSED
                                              └─ ended ──► IDLE
```

**Key invariant:** `currentTrackId` ref guards against loading the same track twice when re-renders occur.

**Retry logic:** `loadUrl()` retries up to 2 times (3 total attempts) with a 1 s delay via `setTimeout` before setting an error state.

**Anonymous playback:** When `user === null`, `getPublicAudioUrl` is called instead of `getSignedAudioUrl`. The server validates `price = 0`; any paid song throws a 403-equivalent.

**Ad banner:** `showAd` local state is set to `true` when the user is null at load time. For registered free users (authenticated but no active subscription) the parent component (`PlayerBar` or `MiniPlayer`) reads subscription state from TanStack Query and derives `showAd` without additional local state.

---

### 2. MobileShell (src/components/mobile/MobileShell.tsx)

Rendered in `__root.tsx` when `usePlatform() === 'native'`, replacing `<Navbar />` and `<PlayerBar />`.

```tsx
interface MobileShellProps {
  children: React.ReactNode;
}
```

Responsibilities:

- Renders `<StatusBarInit />` once on mount (Capacitor StatusBar API calls).
- Wraps content in `pt-[env(safe-area-inset-top)] pb-[calc(env(safe-area-inset-bottom)+4rem+3.5rem)]` so content is never obscured by status bar, MiniPlayer, or BottomTabBar.
- Renders `<MiniPlayer />` above `<BottomTabBar />` at the bottom.

`__root.tsx` modification:

```tsx
function RootComponent() {
  const platform = usePlatform();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {platform === "native" ? (
          <MobileShell>
            <Outlet />
          </MobileShell>
        ) : (
          <>
            <Navbar />
            <main className="min-h-screen">
              <Outlet />
            </main>
            <PlayerBar />
          </>
        )}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
```

---

### 3. StatusBarInit (src/components/mobile/StatusBarInit.tsx)

```tsx
// Runs once on mount on native platforms.
// Uses @capacitor/status-bar (already in package.json).
import { StatusBar, Style } from "@capacitor/status-bar";

export function StatusBarInit() {
  useEffect(() => {
    StatusBar.setStyle({ style: Style.Dark });
    StatusBar.setBackgroundColor({ color: "#0a0a0f" });
  }, []);
  return null;
}
```

---

### 4. BottomTabBar (src/components/mobile/BottomTabBar.tsx)

```tsx
interface Tab {
  to: string;
  label: string;
  icon: LucideIcon;
  ariaLabel: string;
  requireRole?: AppRole; // only shown when user has this role
  requireAuth?: boolean; // redirects to /auth when clicked if not authenticated
}
```

Tab definition (derived from `useUserRoles()` at render time — no hardcoding):

| Tab     | Route                 | Shown when                            |
| ------- | --------------------- | ------------------------------------- |
| Home    | /                     | always                                |
| Browse  | /browse               | always                                |
| Library | /dashboard            | authenticated (redirect /auth if not) |
| Profile | /profile              | authenticated (redirect /auth if not) |
| Studio  | /artist-studio        | isArtist                              |
| Admin   | /admin or /superadmin | isAdmin or isSuperAdmin               |

Active tab: derived from `useRouterState` current pathname. Highlighted with `text-primary` and a filled icon variant; inactive tabs use `text-muted-foreground`.

All tabs have `aria-label`, `aria-current="page"` for the active tab, and minimum `44×44px` touch target enforced via `min-h-[44px] min-w-[44px]`.

Fixed positioning: `fixed bottom-0 inset-x-0 pb-[env(safe-area-inset-bottom)]`.

---

### 5. MiniPlayer (src/components/mobile/MiniPlayer.tsx)

Rendered inside `MobileShell` above `BottomTabBar`. Visible only when `track !== null`.

```tsx
// Reads from Zustand — no props needed
export function MiniPlayer() {
  const track = usePlayer((s) => s.track);
  const playing = usePlayer((s) => s.playing);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const navigate = useNavigate();
  // ...
}
```

Layout: `fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom))] inset-x-0 h-16 bg-card/95 backdrop-blur border-t border-white/10`.

Controls: cover art thumbnail (40×40), title + artist (truncated), loading spinner / play-pause button (`aria-label` toggles "Play"/"Pause"), skip-forward button. Tapping the info area navigates to `/now-playing` (a new modal route).

---

### 6. NowPlayingScreen (src/components/mobile/screens/NowPlayingScreen.tsx)

A full-screen overlay reachable via `/now-playing` route (modal). Swipe-down gesture dismisses via `router.history.back()`.

Contents:

- Cover art `min-h-[280px] min-w-[280px]` centred
- Title, artist name, album name
- Seek slider: Radix `<Slider>` bound to `progressSeconds` / `durationSeconds`, with `aria-valuemin={0}` `aria-valuemax={durationSeconds}` `aria-valuenow={progressSeconds}` `aria-label="Seek"`
- Elapsed / total duration labels
- `SkipBack`, `Play/Pause`, `SkipForward` controls (all ≥44×44px)
- Heart/like toggle calling `toggleLike` server function

---

### 7. Mobile Screen Components

Each mobile screen is a thin wrapper that reads `usePlatform()` at the **route level** and delegates:

```tsx
// src/routes/index.tsx (example pattern)
function IndexPage() {
  const platform = usePlatform();
  return platform === "native" ? <MobileHome /> : <WebHome />;
}
```

| Route file                        | Web component | Mobile component   |
| --------------------------------- | ------------- | ------------------ |
| routes/index.tsx                  | HomePage      | MobileHome         |
| routes/browse.tsx                 | BrowsePage    | MobileBrowse       |
| routes/dashboard.tsx              | DashboardPage | MobileLibrary      |
| routes/artist-studio.tsx          | ArtistStudio  | MobileArtistStudio |
| routes/profile.tsx                | ProfilePage   | MobileProfile      |
| routes/admin.tsx + superadmin.tsx | AdminPage     | MobileAdmin        |
| routes/checkout.tsx               | CheckoutPage  | MobileCheckout     |

**MobileHome:** Featured carousel (horizontal scroll, `embla-carousel-react`), New Releases list (tappable rows → `setTrack`), Trending top-5, Go Premium card.

**MobileBrowse:** Search input at top (44pt), 300 ms debounce on `searchSongs`, genre chip row, single-column song list via `SongRow`.

**MobileLibrary:** Subscription banner, playlists list, recent purchases list, "Create Playlist" bottom-sheet form.

**MobileArtistStudio:** Segmented control (Radix Tabs) for 6 tabs: Upload, Albums, Collaborators, Label, Features, Payouts. File input uses `<input type="file" accept="audio/*">`.

**MobileProfile:** Avatar + display name + role badge, edit form (`updateProfile`), Studio shortcut (if artist), Sign Out button, Manage Subscription link.

**MobileAdmin:** 2×2 stats grid, pending queues (songs/artists/labels) as card lists with Approve/Reject, Payouts tab for superadmin.

**MobileCheckout:** Large tappable payment method cards (≥64pt height), `type="tel"` for phone inputs, `@capacitor/browser` for paymentUrl.

---

### 8. DPO Pay — initiatePayment (src/lib/payments.functions.ts)

Replaces the current stub with a real `createToken` call.

```
POST https://secure.3gdirectpay.com/API/v6/
Content-Type: application/xml

<?xml version="1.0" encoding="utf-8"?>
<API3G>
  <CompanyToken>{DPO_COMPANY_TOKEN}</CompanyToken>
  <Request>createToken</Request>
  <Transaction>
    <PaymentAmount>{amount}</PaymentAmount>
    <PaymentCurrency>ZMW</PaymentCurrency>
    <CompanyRef>{tx.id}</CompanyRef>
    <RedirectURL>{APP_URL}/checkout/success</RedirectURL>
    <BackURL>{APP_URL}/checkout/cancel</BackURL>
    <CompanyRefUnique>0</CompanyRefUnique>
    <PTL>5</PTL>                     <!-- payment token lifetime minutes -->
    {phone ? <PhoneNumber>{phone}</PhoneNumber> : ''}
  </Transaction>
  <Services>
    <Service>
      <ServiceType>{DPO_SERVICE_TYPE}</ServiceType>
      <ServiceDescription>WESU+ {item_type}</ServiceDescription>
      <ServiceDate>{ISO date}</ServiceDate>
    </Service>
  </Services>
</API3G>
```

On `<Result>000</Result>` response, extract `<TransToken>` and:

- Update `payment_transactions.provider_token = TransToken`
- Return `{ transactionId: tx.id, paymentUrl: 'https://secure.3gdirectpay.com/payv2.php?ID=' + TransToken }`

Required env vars: `DPO_COMPANY_TOKEN`, `DPO_SERVICE_TYPE`, `APP_URL`.  
If either DPO var is absent → throw `"Payment gateway not configured"`.

XML parsing uses Node's built-in `DOMParser` (available in Nitro server context) — no extra dependency needed. Alternatively, a minimal regex extract on `<TransToken>` and `<Result>` tags avoids a parser dependency entirely.

---

### 9. DPO Pay — Webhook (src/routes/api/dpo/webhook.ts)

New TanStack Start API route at `/api/dpo/webhook`.

```
POST /api/dpo/webhook
Body (form-encoded or XML): CompanyToken, TransactionToken, CCDapproval, PnrID, ...
```

Flow:

```
Receive POST
  → verify body.CompanyToken === DPO_COMPANY_TOKEN  (reject 401 if mismatch)
  → look up payment_transactions WHERE provider_token = TransactionToken
    → if not found: return HTTP 200, log warning (prevent DPO retry storms)
  → if CCDapproval === '000' (approved):
      → UPDATE payment_transactions SET status='completed'
      → call fulfillTransaction(tx)
  → if CCDapproval !== '000':
      → UPDATE status='failed' or 'cancelled'
  → return HTTP 200 OK
```

`fulfillTransaction` (src/lib/payments.server.ts):

```typescript
async function fulfillTransaction(tx: PaymentTransaction) {
  if (tx.item_type === "subscription") {
    // upsert subscriptions row with status=active, expires_at = now + plan interval
  } else if (tx.item_type === "song" || tx.item_type === "album") {
    // insert purchases row with status=completed
    // trigger revenue split creation (existing logic in artist.functions.ts)
  }
}
```

No new DB migration required — `payment_transactions` already has `provider_token`, `status`, `item_type`, `item_id` columns.

---

### 10. Background Audio (Req 16)

**Plugin:** `@capgo/native-audio` is the recommended Capacitor community plugin for background audio. It must be added to `package.json` and synced to Android.

```
npm install @capgo/native-audio
npx cap sync android
```

**Integration pattern:**

```typescript
// src/lib/native-audio.ts
import { NativeAudio } from "@capgo/native-audio";
import { usePlatform } from "@/hooks/use-platform";

export async function preloadNative(id: string, url: string) {
  try {
    await NativeAudio.preload({ assetId: id, assetPath: url, isUrl: true });
  } catch {
    // plugin absent or unsupported — fall through to HTML audio
  }
}
```

When `usePlatform() === 'native'` and the plugin is available, `PlayerBar` (or a new `NativeAudioEngine`) delegates to `NativeAudio.play()` instead of `HTMLAudioElement`. The Zustand store remains the source of truth; the native plugin fires events back via `NativeAudio.addListener('complete', ...)`.

**Fallback:** If `NativeAudio` throws on any call, the module catches silently and the existing `HTMLAudioElement` path continues — no crash.

**Media notification:** Configured in the Android manifest as part of `@capgo/native-audio` setup — requires `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_MEDIA_PLAYBACK` permissions in `AndroidManifest.xml`.

---

### 11. Network Resilience (Req 17)

**RetryBoundary component** (`src/components/mobile/shared/RetryBoundary.tsx`):

```tsx
// Wraps any query-driven section
function RetryBoundary({ queryKey, children }: { queryKey: QueryKey; children: ReactNode }) {
  // Uses useQueryErrorResetBoundary + React ErrorBoundary
  // Shows "Could not load content — tap to retry" on error
  // Retry button calls queryClient.invalidateQueries(queryKey)
}
```

**TanStack Query staleTime:**

```typescript
// Applied to all three home data queries
const newReleasesQO = queryOptions({
  queryKey: ["new-releases"],
  queryFn: () => getNewReleases(),
  staleTime: 5 * 60 * 1000, // 5 minutes
});
```

**Offline profile persistence** via `@capacitor/preferences`:

```typescript
// src/lib/offline-cache.ts
import { Preferences } from "@capacitor/preferences";

export async function cacheProfile(profile: UserProfile) {
  await Preferences.set({ key: "cached_profile", value: JSON.stringify(profile) });
}
export async function getCachedProfile(): Promise<UserProfile | null> {
  const { value } = await Preferences.get({ key: "cached_profile" });
  return value ? JSON.parse(value) : null;
}
```

`@capacitor/preferences` is not in `package.json` yet — add it.

---

### 12. Deep Link Auth (Req 18)

Android deep links require an intent filter in `android/app/src/main/AndroidManifest.xml`:

```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="com.wesu.music" />
</intent-filter>
```

`capacitor.config.ts` already sets `appId: 'com.wesu.music'` — no change needed.

Supabase auth redirect URL must be configured to `com.wesu.music://login-callback` in the Supabase dashboard → Auth → URL Configuration.

In the app, `@capacitor/app` (already in `package.json`) handles the deep link:

```typescript
// src/integrations/supabase/auth-deep-link.ts
import { App } from "@capacitor/app";
import { supabase } from "./client";

export function registerDeepLinkHandler() {
  App.addListener("appUrlOpen", async ({ url }) => {
    if (url.includes("login-callback")) {
      const params = new URLSearchParams(url.split("?")[1] ?? url.split("#")[1]);
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (access_token && refresh_token) {
        await supabase.auth.setSession({ access_token, refresh_token });
      }
    }
  });
}
```

Called once at app startup in `__root.tsx` inside a `useEffect` guarded by `usePlatform() === 'native'`.

---

## Data Models

No new DB tables are required. The existing schema covers all needs. The following columns are referenced and must exist (all created by existing migrations):

| Table                | Key columns used                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| songs                | id, title, audio_url, cover_url, price, status, play_count, genre, duration, artist_id, album_id           |
| artists              | id, name, user_id, avatar_url, verified, monthly_listeners                                                 |
| albums               | id, title, cover_url, price, featured, release_date, artist_id                                             |
| subscriptions        | id, user_id, status, expires_at, plan_id                                                                   |
| purchases            | id, user_id, song_id, album_id, status                                                                     |
| payment_transactions | id, user_id, amount, currency, method_code, provider, status, item_type, item_id, provider_token, metadata |
| playlists            | id, user_id, name, description, is_public                                                                  |
| playlist_songs       | playlist_id, song_id                                                                                       |
| song_likes           | song_id, user_id                                                                                           |
| user_roles           | user_id, role                                                                                              |
| profiles             | user_id, full_name, bio, avatar_url, location                                                              |

**New migration needed** (`20260624000000_dpo_webhook_idempotency.sql`):

```sql
-- Ensure provider_token is indexed for fast webhook lookup
CREATE INDEX IF NOT EXISTS idx_payment_transactions_provider_token
  ON public.payment_transactions (provider_token)
  WHERE provider_token IS NOT NULL;
```

---

## Correctness Properties

_A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees._

### Property 1: Access control for paid songs

_For any_ song with `price > 0` and any user who has neither an active subscription nor a purchase record for that song, calling `getSignedAudioUrl` with that user's credentials SHALL throw an error with the message "Subscribe or purchase to play full track".

**Validates: Requirements 2.2, 2.3**

---

### Property 2: Free song public URL — no auth required

_For any_ approved song with `price = 0` (or NULL), calling `getPublicAudioUrl` WITHOUT authentication SHALL return a signed URL string and SHALL NOT throw.

**Validates: Requirements 2.5, 3.1**

---

### Property 3: Play count increment

_For any_ song in the database, calling `incrementPlayCount` for that song SHALL result in `songs.play_count` increasing by exactly 1.

**Validates: Requirements 2.1**

---

### Property 4: Ad banner visibility rule

_For any_ authenticated user without an active subscription, OR for any unauthenticated visitor, the PlayerBar/MiniPlayer SHALL render the ad banner strip. _For any_ user with an active subscription, the ad banner SHALL NOT be rendered.

**Validates: Requirements 3.3, 3.5**

---

### Property 5: Auth-required routes redirect unauthenticated users

_For any_ route in {/dashboard, /profile, /artist-studio, /artist-dashboard, /admin, /superadmin, /checkout, /collabs, /label-dashboard} and any unauthenticated visitor, navigating to that route SHALL redirect to `/auth` without rendering the protected content.

**Validates: Requirements 3.7**

---

### Property 6: Upload inserts song with pending status

_For any_ successful audio file upload to the `song-audio` bucket, the `uploadSong` server function SHALL insert a row into `songs` with `status = 'pending'` and return the new `id`.

**Validates: Requirements 4.3**

---

### Property 7: DPO Pay payload completeness

_For any_ valid `initiatePayment` call with `method_code`, `amount`, `item_type`, and (for mobile money) `phone`, the outgoing DPO Pay `createToken` XML request SHALL contain `CompanyToken`, `ServiceType`, `PaymentAmount`, `PaymentCurrency`, `CompanyRef`, `RedirectURL`, `BackURL`, and (when applicable) `PhoneNumber`.

**Validates: Requirements 5.1, 5.4**

---

### Property 8: Missing DPO env vars throw configuration error

_For any_ input to `initiatePayment` when `DPO_COMPANY_TOKEN` or `DPO_SERVICE_TYPE` is absent from the environment, the function SHALL throw an error with the message `"Payment gateway not configured"` and SHALL NOT return a stub response.

**Validates: Requirements 5.3**

---

### Property 9: DPO provider_token persisted

_For any_ successful `createToken` response, the `provider_token` field in `payment_transactions` SHALL be set to the `TransToken` value returned by DPO Pay.

**Validates: Requirements 5.5**

---

### Property 10: Webhook CompanyToken verification

_For any_ POST to `/api/dpo/webhook` where the `CompanyToken` in the payload does NOT match `DPO_COMPANY_TOKEN`, the handler SHALL return HTTP 401 and SHALL NOT update any database row.

**Validates: Requirements 6.2**

---

### Property 11: Payment fulfillment state transitions

_For any_ `PAYMENT_COMPLETED` webhook with a known `provider_token`, after the handler runs:

- `payment_transactions.status` SHALL be `'completed'`
- If `item_type = 'subscription'`: a row in `subscriptions` SHALL exist with `status = 'active'` for that user
- If `item_type = 'song'` or `'album'`: a row in `purchases` SHALL exist with `status = 'completed'` for that user and item

**Validates: Requirements 6.3, 6.4, 6.5**

---

### Property 12: Failed/cancelled payments update transaction status

_For any_ `PAYMENT_FAILED` or `PAYMENT_CANCELLED` webhook with a known `provider_token`, `payment_transactions.status` SHALL be updated to `'failed'` or `'cancelled'` respectively.

**Validates: Requirements 6.6**

---

### Property 13: BottomTabBar renders on native, Navbar hidden

_For any_ render where `usePlatform() === 'native'`, the DOM SHALL contain `BottomTabBar` and SHALL NOT contain `Navbar`. _For any_ render where `usePlatform() === 'web'`, the DOM SHALL contain `Navbar` and SHALL NOT contain `BottomTabBar`.

**Validates: Requirements 5 (Req 7 in spec) AC1**

---

### Property 14: Role-based tab set is dynamically derived

_For any_ combination of roles returned by `useUserRoles()`, the tabs rendered by `BottomTabBar` SHALL exactly match the expected tab set for that role combination — no more, no fewer — with no hardcoded role assumptions in the component.

**Validates: Requirements 7.3 (Req 5 AC3), 19.3**

---

### Property 15: Unauthenticated BottomTabBar shows only Home and Browse

_For any_ render where `user === null`, `BottomTabBar` SHALL render exactly the Home and Browse tabs.

**Validates: Requirements 7.6 (Req 5 AC6)**

---

### Property 16: MiniPlayer renders correctly for any non-null track

_For any_ non-null `track` value in the Zustand store while `usePlatform() === 'native'`, `MiniPlayer` SHALL be rendered and SHALL display the track's title and artist name.

**Validates: Requirements 7.1, 7.2 (Req 7 AC1, AC2)**

---

### Property 17: Play/pause toggle is a round trip

_For any_ initial `playing` state, calling `togglePlay` twice SHALL return the Zustand store to the original `playing` value, and the `HTMLAudioElement` paused state SHALL match accordingly.

**Validates: Requirements 1.3**

---

### Property 18: Seek sets audio currentTime proportionally

_For any_ click position `x` on the progress bar of width `w`, when `durationSeconds = d`, the `HTMLAudioElement.currentTime` SHALL be set to `(x / w) * d` (within floating-point tolerance).

**Validates: Requirements 1.5**

---

### Property 19: AudioEngine error state disables playback

_For any_ error thrown by `getSignedAudioUrl` or `getPublicAudioUrl` (including network errors after 2 retries), the player SHALL set `playing: false` in the Zustand store and SHALL render an inline error message within the PlayerBar/MiniPlayer.

**Validates: Requirements 1.7, 17.1**

---

### Property 20: Signed URL retry up to 2 additional attempts

_For any_ `getSignedAudioUrl` call that fails N times (N ≤ 2) before succeeding, the `AudioEngine` SHALL retry and ultimately succeed. _For any_ call that fails all 3 attempts, the `AudioEngine` SHALL surface an error after the third failure.

**Validates: Requirements 17.2**

---

### Property 21: Home data queries respect 5-minute staleTime

_For any_ re-visit to the home route within 5 minutes of a successful data fetch, TanStack Query SHALL serve the cached response and SHALL NOT issue a new network request for `getNewReleases`, `getTrendingSongs`, or `getFeaturedAlbums`.

**Validates: Requirements 17.4**

---

### Property 22: Sign out clears session

_For any_ authenticated user, calling `supabase.auth.signOut()` SHALL result in `supabase.auth.getUser()` returning `null`, and the app SHALL navigate to the home route.

**Validates: Requirements 18.5**

---

### Property 23: All web routes reachable on native

_For every_ route in the set {/, /browse, /artists, /albums, /subscriptions, /dashboard, /profile, /artist-dashboard, /artist-studio, /collabs, /label-dashboard, /apply-label, /admin, /superadmin, /checkout, /auth}, there SHALL exist at least one of: a BottomTabBar tab, an in-app deep link, or a contextual navigation action that leads to that route when running on native platform.

**Validates: Requirements 19.1**

---

### Property 24: RoleGate violation redirects with toast

_For any_ route protected by `<RoleGate>` and any user lacking the required role, navigating to that route SHALL redirect to `/` and SHALL display a toast notification, and SHALL NOT render the protected route content.

**Validates: Requirements 19.2**

---

### Property 25: ARIA labels present on interactive mobile components

_For any_ rendered `BottomTabBar` tab, the DOM element SHALL have a non-empty `aria-label`. _For any_ rendered `MiniPlayer` play/pause button, the `aria-label` SHALL be `"Play"` when `playing === false` and `"Pause"` when `playing === true`. _For any_ rendered `NowPlayingScreen` seek slider, `aria-valuemin`, `aria-valuemax`, and `aria-valuenow` SHALL be set and `aria-valuenow` SHALL equal `progressSeconds`.

**Validates: Requirements 20.1, 20.2, 20.4**

---

## Error Handling

| Scenario                                  | Handling                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `getSignedAudioUrl` fails (access denied) | Inline error in PlayerBar/MiniPlayer, `playing=false`, toast "Subscribe or purchase to play full track" |
| `getSignedAudioUrl` fails (network)       | Retry up to 2× with 1 s delay; after 3rd failure show inline error                                      |
| `getPublicAudioUrl` called for paid song  | Server throws; client shows "Sign in to play this track" prompt                                         |
| `initiatePayment` missing env vars        | Server throws "Payment gateway not configured"; client shows error toast                                |
| DPO `createToken` non-000 result          | `initiatePayment` throws with DPO error message; transaction stays `pending`                            |
| Webhook unknown `provider_token`          | HTTP 200, log warning, no DB write — prevents DPO retry storms                                          |
| Webhook CompanyToken mismatch             | HTTP 401                                                                                                |
| Route data load failure                   | `RetryBoundary` shows "Could not load content — tap to retry"                                           |
| `RoleGate` violation                      | Redirect to `/`, toast with reason                                                                      |
| Upload fails                              | Display raw Supabase error message to artist                                                            |
| Native audio plugin absent                | Catch silently, fall back to `HTMLAudioElement`                                                         |

---

## Testing Strategy

### Dual Testing Approach

Both unit tests and property-based tests are required. They are complementary:

- Unit tests validate specific examples, edge cases, and integration points.
- Property tests validate universal rules across many generated inputs.

**Property-based testing library:** [fast-check](https://fast-check.io) for TypeScript/JavaScript. Add as a dev dependency:

```
npm install --save-dev fast-check
```

**Test runner:** Vitest (`vitest --run` for CI single-pass).

**Minimum iterations per property test:** 100 (fast-check default; override with `{ numRuns: 100 }` where needed).

**Tag format:** Each property test MUST include a comment:
`// Feature: wesu-plus-completion, Property N: <property_text>`

---

### Unit Tests (Specific Examples & Edge Cases)

- `getPublicAudioUrl` called for paid song → throws with correct message (edge case of Property 2)
- `incrementPlayCount` requires auth — unauthenticated call is rejected (Req 2.4)
- Ad banner CTA: unauthenticated shows "Sign up free" link to `/auth`; free registered user shows "Go Premium" link to `/subscriptions` (Req 3.4)
- Storage upload with `user_id` prefix returns success; `artist_id` prefix is rejected by RLS (Req 4.1, 4.2)
- Cover art upload uses `album-art` bucket (Req 4.5)
- DPO webhook `POST /api/dpo/webhook` responds to POST requests (Req 6.1)
- DPO unknown `provider_token` returns HTTP 200 without throwing (Req 6.7)
- `StatusBar.setStyle` and `setBackgroundColor` are called on native launch (Req 6 StatusBarInit)
- Tapping MiniPlayer track area navigates to `/now-playing` (Req 7 AC5)
- `MiniPlayer` loading state shows spinner when URL request in-flight (Req 7 AC6)
- `capacitor.config.ts` has `appId = 'com.wesu.music'` (Req 18.4)
- Sign out navigates to `/` (Req 18.5 example)

---

### Property-Based Tests

Each of the 25 correctness properties above maps to a single property-based test. Below are the five highest-value implementations described in detail:

**Property 1 — Access control:**

```typescript
// Feature: wesu-plus-completion, Property 1: Access control for paid songs
fc.assert(
  fc.asyncProperty(
    fc.record({ songId: fc.uuid(), userId: fc.uuid() }),
    async ({ songId, userId }) => {
      // seed: song with price=50, no subscription or purchase for userId
      const result = await getSignedAudioUrl({ song_id: songId }, userId);
      expect(result).toThrow("Subscribe or purchase to play full track");
    },
  ),
  { numRuns: 100 },
);
```

**Property 3 — Play count increment:**

```typescript
// Feature: wesu-plus-completion, Property 3: Play count increment
fc.assert(
  fc.asyncProperty(fc.uuid(), async (songId) => {
    const before = await getSongPlayCount(songId);
    await incrementPlayCount({ song_id: songId });
    const after = await getSongPlayCount(songId);
    expect(after).toBe(before + 1);
  }),
  { numRuns: 100 },
);
```

**Property 17 — Play/pause round trip:**

```typescript
// Feature: wesu-plus-completion, Property 17: Play/pause toggle is a round trip
fc.assert(
  fc.property(fc.boolean(), (initialPlaying) => {
    usePlayer.setState({ playing: initialPlaying });
    usePlayer.getState().togglePlay();
    usePlayer.getState().togglePlay();
    expect(usePlayer.getState().playing).toBe(initialPlaying);
  }),
  { numRuns: 100 },
);
```

**Property 14 — Role-based tab derivation:**

```typescript
// Feature: wesu-plus-completion, Property 14: Role-based tab set is dynamically derived
fc.assert(
  fc.property(fc.subarray(["user", "artist", "admin", "superadmin"] as AppRole[]), (roles) => {
    const tabs = computeTabs(roles, true /* authenticated */);
    const hasStudio = roles.includes("artist");
    const hasAdmin = roles.includes("admin") || roles.includes("superadmin");
    expect(tabs.some((t) => t.to === "/artist-studio")).toBe(hasStudio);
    expect(tabs.some((t) => t.to.startsWith("/admin"))).toBe(hasAdmin);
  }),
  { numRuns: 100 },
);
```

**Property 8 — Missing env vars:**

```typescript
// Feature: wesu-plus-completion, Property 8: Missing DPO env vars throw configuration error
fc.assert(
  fc.asyncProperty(
    fc.record({
      amount: fc.float({ min: 1 }),
      method_code: fc.string(),
      item_type: fc.constantFrom("song", "subscription"),
    }),
    async (input) => {
      delete process.env.DPO_COMPANY_TOKEN;
      await expect(initiatePayment(input)).rejects.toThrow("Payment gateway not configured");
    },
  ),
  { numRuns: 100 },
);
```
