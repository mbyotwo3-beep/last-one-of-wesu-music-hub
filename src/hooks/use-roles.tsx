import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";

export type AppRole = "user" | "artist" | "admin" | "superadmin" | "label";

export function useUserRoles() {
  const { user, loading: authLoading } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const userId = user?.id ?? null;
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    let cancel = false;
    async function load() {
      if (!userId) {
        loadedFor.current = null;
        setRoles([]);
        setLoading(false);
        return;
      }
      // Same user re-resolving (token refresh / re-render) — keep cached
      // roles, don't flash loading and don't remount gated forms.
      if (loadedFor.current === userId) return;
      setLoading(true);
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      if (cancel) return;
      loadedFor.current = userId;
      setRoles((data ?? []).map((r) => r.role as AppRole));
      setLoading(false);
    }
    if (!authLoading) load();
    return () => {
      cancel = true;
    };
  }, [userId, authLoading]);

  return {
    roles,
    loading: authLoading || loading,
    isUser: !!user,
    isArtist: roles.includes("artist"),
    isAdmin: roles.includes("admin") || roles.includes("superadmin"),
    isSuperAdmin: roles.includes("superadmin"),
    isLabel: roles.includes("label"),
  };
}
