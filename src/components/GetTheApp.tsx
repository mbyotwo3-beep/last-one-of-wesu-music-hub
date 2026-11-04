import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Download, Smartphone, Share, X } from "lucide-react";

import { useIsMobile, useIsNative } from "@/hooks/use-platform";

/**
 * Getting the app onto someone's phone.
 *
 * WHY THIS EXISTS
 *
 * Listeners kept asking for a mobile app, on the belief that downloads only work
 * in one. The APK had been downloadable at /wesuplus.apk for a while and NOTHING
 * ON THE SITE LINKED TO IT. So the answer to "is there an app?" was a support
 * conversation every time.
 *
 * It also repeats a belief worth correcting gently rather than repeating: downloads
 * DO work in a desktop browser. The offline vault is IndexedDB, which is per
 * browser and per device, so a desktop listener keeps their downloads on their
 * desktop exactly as a phone listener does. What they may be missing is the
 * shell — an icon, fullscreen, and working offline — and that is what installing
 * gives them, on either platform.
 *
 * WHICH ROUTE, AND WHY
 *
 * Android phone: a real APK, because it is already built, signed and hosted.
 * iPhone: Safari does not install APKs and its PWA experience is weaker, so
 * "Add to Home Screen" is the honest instruction rather than a download button
 * that would fail.
 * Desktop: the site is already installable as an app (manifest + service worker),
 * so the prompt is offered instead of an APK that would be wrong for a Mac.
 */

const APK_URL = "/wesuplus.apk";
const APK_SIZE_MB = 7.4;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** iOS Safari is the only case where the button must describe manual steps. */
function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
  // Exclude in-app browsers, which cannot add to the home screen.
  const inApp = /FBAN|FBAV|Instagram|Line\/|MicroMessenger/.test(ua);
  return iOS && !inApp;
}

/** Has this app already been installed from the web? */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true || iosStandalone === true
  );
}

export function GetTheApp() {
  const navigate = useNavigate();
  const isNative = useIsNative();
  const isMobile = useIsMobile();

  const [dismissed, setDismissed] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

  // Already inside the app, or already installed from the web: nothing to offer.
  // Also nothing to offer on a desktop browser that has not offered a prompt.
  const installed = isNative || isStandalone();
  const relevant = isMobile || installEvent !== null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPrompt = (e: Event) => {
      // Chrome requires preventDefault() or it shows its own mini-infobar.
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallEvent(null);
      setDismissed(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || dismissed || !relevant) return null;

  const canPrompt = installEvent !== null;
  const showIos = !canPrompt && isIosSafari();

  const install = async () => {
    if (installEvent) {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      // Only stay dismissed if they declined. Auto-dismissing on accept would
      // hide the panel permanently even for someone who wants it later.
      if (choice.outcome === "dismissed") setDismissed(true);
      return;
    }
    // Android without a captured prompt: the APK is the reliable route.
    // (iOS never reaches here — its guidance to use desktop/Android replaced the
    // install action.)
    window.location.href = APK_URL;
  };

  const label = canPrompt ? "Install the app" : showIos ? "Add to Home Screen" : "Get the app";

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">
          {showIos ? (
            <Share className="size-5 text-primary" />
          ) : (
            <Download className="size-5 text-primary" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Take Wesu+ with you</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {canPrompt
              ? "Install it for fullscreen playback, an icon on your home screen, and music that plays with no data."
              : showIos
                ? "A native iOS app is on the way — until then, take Wesu+ with you through the browser or an Android phone."
                : `The app is ${APK_SIZE_MB} MB. Downloads keep working here in the browser too — the app just makes them easier to reach.`}
          </p>

          {showIos ? (
            <div className="mt-3 text-xs text-muted-foreground space-y-2">
              <p>
                Wesu+&apos;s native iOS app isn&apos;t here yet, so an iPhone can&apos;t install the
                APK we ship today — iOS simply doesn&apos;t allow it.
              </p>
              <p>
                To take the music with you <strong>now</strong>, point your phone at one of the two
                working routes:
              </p>
              <ul className="space-y-1 list-disc list-inside">
                <li>
                  <strong className="text-foreground">Desktop browser</strong> — open Wesu+ and
                  download; the offline vault lives in browser storage there too.
                </li>
                <li>
                  <strong className="text-foreground">Android phone</strong> — install the real
                  APK and download straight into the app&apos;s vault.
                </li>
              </ul>
              <p>
                And a <strong className="text-foreground">native iOS mobile app</strong> is coming
                soon — then downloads, fullscreen playback and offline music arrive on iPhone directly.
              </p>
            </div>
          ) : null}

          {showIos ? (
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Dismiss"
              className="mt-2 p-1.5 rounded-full text-muted-foreground hover:bg-muted cursor-pointer inline-flex items-center"
            >
              <X className="size-4" />
            </button>
          ) : null}

          {!showIos ? (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={install}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-primary-foreground text-xs font-bold cursor-pointer"
              >
                <Smartphone className="size-4" />
                {label}
              </button>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                aria-label="Dismiss"
                className="p-1.5 rounded-full text-muted-foreground hover:bg-muted cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : null}

          {/* A listener whose downloads already work has no reason to install.
              Saying so is more useful than implying the browser is limited. */}
          {!canPrompt && !showIos ? (
            <button
              type="button"
              onClick={() => navigate({ to: "/downloads" })}
              className="mt-3 text-xs text-primary underline cursor-pointer"
            >
              Go to your downloads instead
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
