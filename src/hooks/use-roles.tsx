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

  const { data, isPending } = useQuery({
    queryKey: ["user-roles", userId],
    enabled: !!userId,
    // Roles change only when the account does; keep it warm so a nav bounce
    // never shows a gate flash.
    staleTime: 5 * 60 * 1000,
    retry: 2,
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

  return {
    roles,
    loading,
    isUser: !!user,
    isArtist: roles.includes("artist"),
    isAdmin: roles.includes("admin") || roles.includes("superadmin"),
    isSuperAdmin: roles.includes("superadmin"),
    isLabel: roles.includes("label"),
    // Staff is what "can publish an editorial playlist" means — admin or
    // superadmin. `isAdmin` already covers exactly that, but naming the
    // capability here keeps callers from having to re-derive it.
    isStaff: roles.includes("admin") || roles.includes("superadmin"),
  };
}
