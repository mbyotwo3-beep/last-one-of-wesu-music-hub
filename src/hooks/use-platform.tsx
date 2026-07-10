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
