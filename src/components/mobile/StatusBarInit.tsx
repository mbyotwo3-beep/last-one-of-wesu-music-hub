import { useEffect } from "react";

/**
 * Render-less component that configures the Capacitor status bar once on mount.
 * Uses @capacitor/status-bar (already in package.json).
 */
export function StatusBarInit() {
  useEffect(() => {
    async function init() {
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setBackgroundColor({ color: "#0a0a0f" });
      } catch {
        // Plugin unavailable on web — silently ignore
      }
    }
    init();
  }, []);

  return null;
}
