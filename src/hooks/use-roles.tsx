import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";

export type AppRole = "user" | "artist" | "admin" | "superadmin";

export function useUserRoles() {
  const { user, loading: authLoading } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    async function load() {
      if (!user) {
        setRoles([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      if (cancel) return;
      setRoles((data ?? []).map((r) => r.role as AppRole));
      setLoading(false);
    }
    if (!authLoading) load();
    return () => {
      cancel = true;
    };
  }, [user, authLoading]);

  return {
    roles,
    loading: authLoading || loading,
    isUser: !!user,
    isArtist: roles.includes("artist"),
    isAdmin: roles.includes("admin") || roles.includes("superadmin"),
    isSuperAdmin: roles.includes("superadmin"),
  };
}
