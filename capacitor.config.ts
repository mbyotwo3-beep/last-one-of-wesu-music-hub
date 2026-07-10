import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Wesu+ Capacitor configuration.
 *
 * Splash & status bar are branded with the warm-cream light theme
 * (background #fbf7ee) and the deep-blue brand accent (#0c3c93) that
 * match the web `manifest.webmanifest` theme_color. Replace the drawable
 * resources under `android/app/src/main/res/drawable/` with the Wesu
 * mark (public/favicon.png) after running `npx cap add android`.
 */
const config: CapacitorConfig = {
  appId: "com.wesu.music",
  appName: "Wesu+",
  webDir: "dist",
  server: {
    // For live-reload during development against the Lovable preview, uncomment:
    // url: 'https://id-preview--3d992fed-0a4b-4613-aa6b-368907935324.lovable.app',
    // cleartext: true,
    androidScheme: "https",
  },
  android: {
    backgroundColor: "#fbf7ee",
  },
  ios: {
    backgroundColor: "#fbf7ee",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: "#fbf7ee",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
    StatusBar: {
      backgroundColor: "#fbf7ee",
      style: "LIGHT",
    },
  },
};

export default config;
