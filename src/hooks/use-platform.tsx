import { useEffect, useState } from "react";

export type Platform = "web" | "native";

/**
 * Returns 'native' when running inside the Capacitor Android/iOS wrapper,
 * 'web' otherwise. Use this to render different UIs for the mobile app
 * vs the browser site while sharing the same backend.
 *
 * Example:
 *   const platform = usePlatform();
 *   return platform === 'native' ? <MobileHome /> : <WebHome />;
 */
export function usePlatform(): Platform {
  const [platform, setPlatform] = useState<Platform>("web");

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Capacitor injects window.Capacitor when running inside the native shell.
    const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
    if (w.Capacitor?.isNativePlatform?.()) {
      setPlatform("native");
    }
  }, []);

  return platform;
}

export function useIsNative() {
  return usePlatform() === "native";
}

/**
 * Detects if the user is on a mobile device (browser or native).
 * Uses user agent and screen width detection.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
      const mobileRegex = /android|ipad|iphone|ipod|windows phone|iemobile|blackberry|mobile/i;
      const isMobileUA = mobileRegex.test(userAgent);
      const isSmallScreen = window.innerWidth < 768;
      setIsMobile(isMobileUA || isSmallScreen);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}
