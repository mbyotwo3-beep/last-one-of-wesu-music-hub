// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // The shared config defaults Nitro to Cloudflare. Keep that target for
  // local/Cloudflare previews, but make Vercel builds emit Vercel functions.
  // Vercel provides this environment variable during every deployment.
  nitro: {
    preset: process.env.VERCEL ? "vercel" : "cloudflare-module",
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    build: {
      rollupOptions: {
        external: ['crypto', 'node:crypto'],
        output: {
          // Split the ~840KB index bundle into cacheable vendor chunks so
          // repeat visits and route changes only download what changed.
          // Order matters: tanstack entries also match /react/, so test
          // the most specific packages first.
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (id.includes("@tanstack")) return "vendor-tanstack";
            if (id.includes("@supabase")) return "vendor-supabase";
            if (id.includes("@radix-ui")) return "vendor-radix";
            if (id.includes("lucide-react")) return "vendor-lucide";
            if (id.includes("@capacitor") || id.includes("@capgo")) return "vendor-capacitor";
            if (id.includes("dnd-kit") || id.includes("embla-carousel")) return "vendor-dnd";
            if (
              id.includes("/react/") ||
              id.includes("react-dom") ||
              id.includes("/scheduler/") ||
              id.includes("zustand")
            )
              return "vendor-react";
            return "vendor";
          },
        },
        onwarn(warning, warn) {
          // Ignore warnings about external crypto module
          if (warning.code === 'MODULE_NOT_FOUND' && warning.message.includes('crypto')) {
            return;
          }
          warn(warning);
        },
      },
    },
    ssr: {
      // Don't externalize crypto for SSR - it's needed on the server
      noExternal: ['crypto', 'node:crypto'],
    },
    server: {
      hmr: {
        overlay: false, // Prevents full-screen error overlays from forcing reloads
      },
    },
  },
});
