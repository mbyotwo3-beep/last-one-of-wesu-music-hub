import { useRouter } from "@tanstack/react-router";
import { WifiOff } from "lucide-react";

import { OfflineDiagnostics } from "@/components/OfflineDiagnostics";

/**
 * What a route shows when it simply cannot be reached.
 *
 * The wording is the whole point. The previous screen said "This page didn't
 * load" with a red warning icon and a "Try again" button — which tells someone
 * with no data that something is broken, and offers a retry that cannot succeed.
 * Both are wrong and the second is a dead end.
 *
 * It also must never imply anything is missing from their account, or that a
 * download failed. Losing signal is not a fault of theirs and changes nothing.
 *
 * The diagnostics panel is here because this screen is where someone lands when
 * offline is broken. Showing them WHY is the only way to stop guessing: the
 * failure could be no worker, an unregistered worker, an empty cache, or a
 * healthy vault with a playback problem — and all four look identical from
 * outside.
 */
export function OfflineRouteNotice({ what }: { what?: string }) {
  const router = useRouter();
  return (
    <div className="px-6 py-16 max-w-md mx-auto">
      <div className="text-center">
        <div className="inline-flex items-center justify-center size-14 rounded-full bg-amber-500/10 mb-4">
          <WifiOff className="size-6 text-amber-500" />
        </div>
        <h1 className="text-xl font-bold mb-2">
          {what ? `Can’t show ${what} right now` : "You’re offline"}
        </h1>
        <p className="text-muted-foreground text-sm mb-6">
          {what
            ? "This needs a connection. Your downloads still play, and nothing has changed on your account."
            : "This page needs a connection. Your downloads still play, and nothing has changed on your account."}
        </p>
        <button
          onClick={() => router.navigate({ to: "/downloads" })}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold min-h-[44px] cursor-pointer"
        >
          Go to downloads
        </button>
      </div>

      <div className="mt-8 text-left">
        <OfflineDiagnostics />
      </div>
    </div>
  );
}
