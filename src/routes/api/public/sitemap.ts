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
  "/radio",
  "/playlists",
  "/contact",
  "/terms",
  "/terms-listener",
  "/terms-artist",
  "/become-artist",
  "/apply-label",
];

function origin() {
  return (process.env["APP_URL"] || "https://www.wesuplusly.com").replace(/\/+$/, "");
}

export const Route = createFileRoute("/api/public/sitemap")({
  server: {
    handlers: {
      GET: async () => {
        const base = origin();
        const urls = STATIC_PATHS.map(
          (p) => `  <url><loc>${base}${p}</loc></url>`,
        ).join("\n");
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
});
