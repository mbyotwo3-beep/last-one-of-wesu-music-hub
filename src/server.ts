import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    // Canonical host. The wesuplus.com -> www redirect cannot be expressed as
    // a vercel.json routing rule: rules that cannot be applied to the
    // deployment's own routing output make the production alias step fail,
    // and then NO deploy ships (production keeps the last good one). So the
    // apex is answered here, at the HTTP layer, before any app bootstrap.
    // The original host arrives either in request.url or, where a proxy
    // rewrote it, in x-forwarded-host (Vercel sets it to the requested host;
    // it may be a comma list with a port). Path and query are untouched by
    // the proxy, so they carry over byte for byte.
    const forwardedHost = (request.headers.get("x-forwarded-host") ?? "").split(",")[0].split(":")[0].trim().toLowerCase();
    const requestHost = new URL(request.url).hostname.toLowerCase();
    const host = forwardedHost || requestHost;
    if (host === "wesuplus.com") {
      const { pathname, search } = new URL(request.url);
      return new Response(null, {
        status: 308,
        headers: { Location: `https://www.wesuplus.com${pathname}${search}` },
      });
    }
    if (env && typeof env === "object") {
      (globalThis as any).__env__ = env;
      for (const [key, value] of Object.entries(env)) {
        if (typeof value === "string") {
          process.env[key] = value;
        }
      }
    }
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
