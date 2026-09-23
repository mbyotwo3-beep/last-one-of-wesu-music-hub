import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/songs")({
  head: () => ({ meta: [{ title: "Songs — Wesu+" }] }),
  // Render <Outlet /> so nested routes like /songs/$id are displayed.
  // The bare /songs path redirects to Browse — scoped to the exact path
  // so child routes are unaffected.
  component: () => {
    const navigate = useNavigate();
    const pathname = useRouterState({ select: (s) => s.location.pathname });
    useEffect(() => {
      if (pathname === "/songs") navigate({ to: "/browse", replace: true });
    }, [pathname, navigate]);
    return <Outlet />;
  },
});
