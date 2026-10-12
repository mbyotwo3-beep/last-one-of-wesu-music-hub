import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";

export type AppRole = "user" | "artist" | "admin" | "superadmin" | "label";

/**
 * Roles for the signed-in user.
 *
 * Previously a hand-rolled useEffect + ref cache. That had two defects:
 *  1. A single failed fetch resolved to roles=[] and was cached for the whole
 *     session (the effect deps never changed, so nothing retried). An artist on
 *     a flaky connection got bounced off /artist-dashboard with a toast saying
 *     they lacked the artist role — plus "Become an Artist" in the nav.
 *  2. The hook is mounted in up to four components at once (RoleGate,
 *     Navbar, BottomTabBar, the route page), so each did its own raw fetch.
 *
 * React Query gives one shared request, automatic retry, and no poisoned
 * cache. `loading` keeps its old meaning: still resolving, so gates must wait.
 */
export function useUserRoles() {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["user-roles", userId],
    enabled: !!userId,
    // Roles change only when the account does; keep it warm so a nav bounce
    // never shows a gate flash.
    staleTime: 5 * 60 * 1000,
    // Three, not two, and with a delay. An expired access token refreshed
    // mid-request is the common cause of the failure this hook has to survive.
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId!);
      if (error) throw error;
      return (rows ?? []).map((r) => r.role as AppRole);
    },
  });

  const roles = data ?? [];
  // Keep gates waiting while auth settles or the roles request is in flight.
  const loading = authLoading || (!!userId && isPending);

  /**
   * Did we actually find out?
   *
   * THIS IS THE FIX. The query used to destructure only `{ data, isPending }` and
   * silently throw away `isError`. A failed read therefore produced `roles: []`,
   * which is indistinguishable from "you really have no roles" — so RoleGate
   * told a genuine artist "You need a different account type… Your account isn't
   * one yet", with a Become an Artist button, on their own dashboard.
   *
   * With staleTime of five minutes the wrong answer also survived a refresh, and
   * because four components read this hook, the nav offered "Become an Artist" as
   * well.
   *
   * A failed read is not a denial. Callers must be able to tell the difference,
   * and must never claim someone lacks a role they might hold.
   */
  const checked = !authLoading && (!userId || (data !== undefined || isError));

  return {
    roles,
    loading,
    /** True when the read succeeded, so `roles` can be trusted. */
    checked,
    /** True when we could not find out. Never render a denial on this. */
    failed: isError,
    error,
    refetch,
    isUser: !!user,
    isArtist: checked && !isError && roles.includes("artist"),
    isAdmin: checked && !isError && (roles.includes("admin") || roles.includes("superadmin")),
    isSuperAdmin: checked && !isError && roles.includes("superadmin"),
    isLabel: checked && !isError && roles.includes("label"),
    // Staff is what "can publish an editorial playlist" means — admin or
    // superadmin. `isAdmin` already covers exactly that, but naming the
    // capability here keeps callers from having to re-derive it.
    isStaff: checked && !isError && (roles.includes("admin") || roles.includes("superadmin")),
  };
}
