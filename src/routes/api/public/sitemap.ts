import { createFileRoute } from "@tanstack/react-router";

const STATIC_PATHS = [
  "/",
  "/browse",
  "/songs",
  "/albums",
  "/artists",
  "/labels",
  "/new-music",
  "/hot-tracks",
  "/must-have",
  "/recently-added",
  "/playlists",
  "/contact",
  "/terms",
  "/terms-listener",
  "/terms-artist",
  "/privacy",
  "/become-artist",
  "/apply-label",
  "/podcast",
];

async function origin() {
  try {
    const { getSiteConfigServer } = await import("@/lib/pricing.functions");
    const siteConfig = await getSiteConfigServer();
    return (process.env["APP_URL"] || siteConfig.url).replace(/\/+$/, "");
  } catch {
    return (process.env["APP_URL"] || "https://www.wesuplus.com").replace(/\/+$/, "");
  }
}

// API routes are server routes by definition. The explicit `server: {handlers}`
// wrapper was removed in @tanstack/react-start 1.168.60 (the property no longer
// exists on a server route definition), so the handler is declared directly.
// A GET export is all a server route needs.
export const Route = createFileRoute("/api/public/sitemap")({
  server: {
    handlers: {
      GET: async () => {
        const base = await origin();
        const urls = STATIC_PATHS.map((p) => `  <url><loc>${base}${p}</loc></url>`).join("\n");
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
        return new Response(xml, {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
} as any);
