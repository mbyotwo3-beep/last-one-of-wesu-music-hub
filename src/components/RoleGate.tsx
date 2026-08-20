import { type ReactNode, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useUserRoles, type AppRole } from "@/hooks/use-roles";
import { checkRoleAccess } from "@/components/roleGate.utils";
import { toast } from "sonner";

interface Props {
  require: "user" | "artist" | "admin" | "superadmin";
  children: ReactNode;
}

export function RoleGate({ require, children }: Props) {
  const { isUser, isArtist, isAdmin, isSuperAdmin, loading } = useUserRoles();
  const navigate = useNavigate();

  const access = loading
    ? null
    : checkRoleAccess({ require, isUser, isArtist, isAdmin, isSuperAdmin });
  const ok = access === "allowed";

  useEffect(() => {
    if (loading) return;
    if (access === "redirect-auth") {
      navigate({ to: "/auth", search: { redirect: window.location.pathname + window.location.search } });
      return;
    }
    if (access === "redirect-home") {
      toast.error(`You need the "${require}" role to access this page.`);
      navigate({ to: "/" });
    }
  }, [loading, access, require, navigate]);

  if (loading) return <div className="p-12 text-center text-muted-foreground">Loading…</div>;
  if (!ok) return null;

  return <>{children}</>;
}

export type { AppRole };
