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
    // The APK is a native shell around the production site (this is an SSR
    // app, so there is no static index.html to bundle — the WebView loads
    // the live deployment, while audio/filesystem/splash/deep-links run
    // natively on device).
    url: "https://www.wesuplus.com",
    // For live-reload during development, point url at your dev server
    // ('http://10.0.2.2:3000' for the emulator) instead.
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
