import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { useOfflineMode } from "@/stores/offline-mode";

export type OnlineTransition = "went-offline" | "went-online" | "none";

/** Pure: classify an online/offline edge (unit-tested). */
export function describeOnlineTransition(
  prevOnline: boolean,
  nowOnline: boolean,
): OnlineTransition {
  if (prevOnline && !nowOnline) return "went-offline";
  if (!prevOnline && nowOnline) return "went-online";
  return "none";
}

function readOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

/**
 * Offline lifecycle: hydrates the offline store and announces the edges.
 * Renders NOTHING.
 *
 * WHY THIS IS A SEPARATE COMPONENT FROM OfflineChip
 *
 * This used to be `OfflineBanner`, and it drew a full-width strip across the top
 * of every page. Stripping the strip out meant separating two things that had been
 * tangled together for the length of the project:
 *
 *   this file  — behaviour. Hydrating the store on boot, and toasting on the
 *                offline/online edge so a listener learns the network dropped.
 *   OfflineChip — presentation. A small persistent pill in the header.
 *
 * Both were needed. Deleting the component wholesale would have silently removed
 * `hydrate()`, which primes the vault index — so the first tap after a cold start
 * with the connection down would not have been filtered and would have tried to stream.
 * That is the failure this project has hit repeatedly: removing the visible part
 * and taking the behaviour with it.
 *
 * The name is `OfflineLifecycle` rather than keeping `OfflineBanner`, because a
 * component called OfflineBanner that renders nothing is exactly the kind of
 * thing that gets "restored" by someone who assumes it draws a banner.
 */
export function OfflineLifecycle() {
  const navigate = useNavigate();
  const wasOffline = useRef(false);
  const hydrate = useOfflineMode((s) => s.hydrate);

  // The store boots false because it is evaluated during SSR, where navigator
  // does not exist. Reading it here keeps the first client render in agreement
  // with actual connectivity — and primes the vault index, so the very first
  // tap offline is filtered rather than slipping through to a doomed stream.
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    let prev = readOnline();
    const update = () => {
      const now = readOnline();
      const edge = describeOnlineTransition(prev, now);
      if (edge === "went-offline") {
        wasOffline.current = true;
        // The store IS the offline state now (no user switch any more): mirror
        // the edge so the player's downloads-only gating reacts the same way a
        // cold start does. Doing this here also arms the vault index — the
        // first tap after the signal drops filters instead of streaming.
        useOfflineMode.getState().setEnabled(true);
        toast("You're offline", {
          description: "Downloaded songs keep playing.",
        });
      } else if (edge === "went-online") {
        useOfflineMode.getState().setEnabled(false);
        if (wasOffline.current) {
          wasOffline.current = false;
          toast.success("Back online", {
            description: "Stream anything, or keep playing downloads.",
            action: {
              label: "Browse",
              onClick: () => navigate({ to: "/browse" }),
            },
          });
        }
      }
      prev = now;
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [navigate]);

  return null;
}