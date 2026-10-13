import { type ReactNode, useEffect, useRef } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useUserRoles, type AppRole } from "@/hooks/use-roles";
import { checkRoleAccess } from "@/components/roleGate.utils";
import { toast } from "sonner";

interface Props {
  require: "user" | "artist" | "admin" | "superadmin" | "label";
  children: ReactNode;
}

export function RoleGate({ require, children }: Props) {
  const { isUser, isArtist, isAdmin, isSuperAdmin, isLabel, loading, failed, refetch } =
    useUserRoles() as any;
  const navigate = useNavigate();
  // Router location (not window.location) so redirects work on native +
  // preserve hash, and replace:true so the forbidden page isn't kept in
  // history (prevents back-button redirect loops).
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const redirectedRef = useRef(false);

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
  const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
  const ok = access === "allowed" || (isOffline && require === "user");

  useEffect(() => {
    if (loading || failed) return;
    if (isOffline && require === "user") return;
    if (access === "redirect-auth") {
      if (pathname === "/auth" || redirectedRef.current) return;
      redirectedRef.current = true;
      const target = pathname + (searchStr ?? "");
      navigate({
        to: "/auth",
        search: { redirect: target },
        replace: true,
      });
      return;
    }
    redirectedRef.current = false;
    // A wrong-role visit no longer bounces to "/": it stays put and renders the
    // explanation + the way forward. Navigating away meant the toast was the
    // only signal, and the toast claimed the user *lacks* the role — which was
    // also what a transient roles-fetch failure looked like.
    if (access === "redirect-home") {
      toast.error(`You need the "${require}" role to access this page.`);
    }
  }, [loading, failed, access, require, pathname, searchStr]);

  if (loading) return <div className="p-12 text-center text-muted-foreground">Loading…</div>;

  /**
   * We could not find out what roles this account has.
   *
   * Before this screen existed, a failed roles read fell through to the denial
   * below, which told a real artist "Your account isn't one yet" and offered
   * Become an Artist — on the artist's own dashboard. The old answer to a
   * connection problem was an accusation.
   *
   * Nothing here claims what the user is or is not. It says only what is true:
   * we could not check, and here is the button.
   */
  if (failed) {
    if (require === "user" && (isUser || (typeof navigator !== "undefined" && navigator.onLine === false))) {
      return <>{children}</>;
    }
    return (
      <div className="px-6 py-16 text-center max-w-md mx-auto">
        <h1 className="text-xl font-bold mb-2">We couldn't check your account</h1>
        <p className="text-muted-foreground text-sm mb-6">
          We couldn't load your account details, so we can't tell whether you can open this page.
          Nothing is wrong with your account — this is a connection problem.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={() => {
              refetch?.();
            }}
            className="px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold min-h-[44px] cursor-pointer"
          >
            Try again
          </button>
          <Link
            to="/dashboard"
            className="px-5 py-2.5 rounded-full bg-secondary text-secondary-foreground font-semibold inline-block"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    );
  }
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
