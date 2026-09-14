import { type ReactNode, useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useUserRoles, type AppRole } from "@/hooks/use-roles";
import { checkRoleAccess } from "@/components/roleGate.utils";
import { toast } from "sonner";

interface Props {
  require: "user" | "artist" | "admin" | "superadmin" | "label";
  children: ReactNode;
}

export function RoleGate({ require, children }: Props) {
  const { isUser, isArtist, isAdmin, isSuperAdmin, isLabel, loading } = useUserRoles() as any;
  const navigate = useNavigate();
  // Router location (not window.location) so redirects work on native +
  // preserve hash, and replace:true so the forbidden page isn't kept in
  // history (prevents back-button redirect loops).
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });

  const access = loading
    ? null
    : checkRoleAccess({
        require: require as any,
        isUser,
        isArtist,
        isAdmin,
        isSuperAdmin,
        isLabel,
      });
  const ok = access === "allowed";

  useEffect(() => {
    if (loading) return;
    if (access === "redirect-auth") {
      navigate({
        to: "/auth",
        search: { redirect: pathname + (searchStr ?? "") },
        replace: true,
      });
      return;
    }
    if (access === "redirect-home") {
      toast.error(`You need the "${require}" role to access this page.`);
      navigate({ to: "/", replace: true });
    }
  }, [loading, access, require, navigate, pathname, searchStr]);

  if (loading) return <div className="p-12 text-center text-muted-foreground">Loading…</div>;
  if (!ok) return null;

  return <>{children}</>;
}

export type { AppRole };
