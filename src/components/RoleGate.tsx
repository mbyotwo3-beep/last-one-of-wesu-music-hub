import { type ReactNode, useEffect } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
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
    // A wrong-role visit no longer bounces to "/": it stays put and renders the
    // explanation + the way forward. Navigating away meant the toast was the
    // only signal, and the toast claimed the user *lacks* the role — which was
    // also what a transient roles-fetch failure looked like.
    if (access === "redirect-home") {
      toast.error(`You need the "${require}" role to access this page.`);
    }
  }, [loading, access, require, pathname, searchStr]);

  if (loading) return <div className="p-12 text-center text-muted-foreground">Loading…</div>;
  // Don't render nothing: a bare `null` under the nav looked like a broken
  // page. Show what is missing AND the way forward — otherwise a listener who
  // lands on /artist-studio is bounced home by a toast with no path to apply.
  if (!ok) {
    return (
      <div className="px-6 py-16 text-center max-w-md mx-auto">
        <h1 className="text-xl font-bold mb-2">You need a different account type</h1>
        <p className="text-muted-foreground text-sm mb-6">
          This page is for {require === "artist" ? "artists" : `${require}s`}. Your account isn't
          one yet.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {require === "artist" ? (
            <Link
              to="/become-artist"
              className="px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold inline-block"
            >
              Become an Artist
            </Link>
          ) : (
            <Link
              to="/contact"
              className="px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold inline-block"
            >
              Contact us
            </Link>
          )}
          <Link
            to="/dashboard"
            className="px-5 py-2.5 rounded-full bg-secondary font-semibold inline-block"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export type { AppRole };
