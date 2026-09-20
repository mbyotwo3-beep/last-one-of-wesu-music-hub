import { useEffect } from "react";
import { useTheme } from "@/hooks/use-theme";

/**
 * Render-less component that configures the Capacitor status bar.
 * Follows the app theme (cream/light in light mode, near-black in dark)
 * so the bar never flashes a mismatched color. Uses @capacitor/status-bar
 * (already in package.json); silently no-ops on web.
 */
export function StatusBarInit() {
  const { resolved } = useTheme();

  useEffect(() => {
    async function init() {
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        await StatusBar.setOverlaysWebView({ overlay: false });
        if (resolved === "dark") {
          await StatusBar.setStyle({ style: Style.Dark });
          await StatusBar.setBackgroundColor({ color: "#0a0a0f" });
        } else {
          await StatusBar.setStyle({ style: Style.Light });
          await StatusBar.setBackgroundColor({ color: "#fbf7ee" });
        }
      } catch {
        // Plugin unavailable on web — silently ignore
      }
    }
    init();
  }, [resolved]);

  return null;
}
