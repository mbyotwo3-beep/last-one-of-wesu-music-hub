import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

// ─── Shared singleton auth state ─────────────────────────────
// Previously every useAuth() caller created its own getSession() +
// onAuthStateChange subscription (Navbar alone had 2, plus every page).
// TOKEN_REFRESHED then fanned out N setUser calls → skeleton flashes +
// Outlet remounts that wiped upload File state. Now one subscription feeds
// all callers via useSyncExternalStore.
let cachedUser: User | null = null;
let cachedLoading = true;
let initialized = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function ensureInit() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  supabase.auth.getSession().then(({ data: { session } }) => {
    cachedUser = session?.user ?? null;
    cachedLoading = false;
    emit();
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    const nextId = session?.user?.id ?? null;
    const prevId = cachedUser?.id ?? null;
    // Only emit when identity actually changes or loading resolves —
    // token refreshes with same user id must not remount forms.
    if (nextId !== prevId || cachedLoading) {
      cachedUser = session?.user ?? null;
      cachedLoading = false;
      emit();
    } else if (session?.user) {
      cachedUser = session.user;
    }
  });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): { user: User | null; loading: boolean } {
  return { user: cachedUser, loading: cachedLoading };
}

// Server snapshot — always logged out / loading to avoid hydration mismatch.
function getServerSnapshot(): { user: User | null; loading: boolean } {
  return { user: null, loading: true };
}

export function useAuth() {
  ensureInit();
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
