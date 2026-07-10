import { type ReactNode, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useUserRoles, type AppRole } from "@/hooks/use-roles";
import { toast } from "sonner";

interface Props {
  require: "user" | "artist" | "admin" | "superadmin";
  children: ReactNode;
}

export function RoleGate({ require, children }: Props) {
  const { isUser, isArtist, isAdmin, isSuperAdmin, loading } = useUserRoles();
  const navigate = useNavigate();

  const ok =
    !loading &&
    (require === "user"
      ? isUser
      : require === "artist"
        ? isArtist || isAdmin || isSuperAdmin
        : require === "admin"
          ? isAdmin
          : require === "superadmin"
            ? isSuperAdmin
            : false);

  useEffect(() => {
    if (loading) return;
    if (!isUser) {
      navigate({ to: "/auth" });
      return;
    }
    if (!ok) {
      toast.error(`You need the "${require}" role to access this page.`);
      navigate({ to: "/" });
    }
  }, [loading, isUser, ok, require, navigate]);

  if (loading) return <div className="p-12 text-center text-muted-foreground">Loading…</div>;
  if (!isUser || !ok) return null;

  return <>{children}</>;
}

export type { AppRole };
