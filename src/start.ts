import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

/**
 * Server-fn responses are per-user JSON but shipped `Cache-Control: public`.
 * With max-age=0 must-revalidate a healthy browser revalidates, but ANY layer
 * between the WebView and the origin (a captive proxy, a middlebox, a
 * misbehaving edge) that treats `public` as "cacheable" can answer a later
 * call with an earlier deployment's HTML — which is exactly the app-side
 * "rpc 200 ct=text/html" that rendered Browse and Search falsely empty.
 * Personalized RPC responses must never be shared-cacheable at all.
 */
const serverFnNoStoreMiddleware = createMiddleware().server(async ({ request, next }) => {
  const response = await next();
  if (
    typeof request?.url === "string" &&
    request.url.includes("/_serverFn/") &&
    response instanceof Response
  ) {
    const headers = new Headers(response.headers);
    headers.set("cache-control", "private, no-store");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
  return response;
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, serverFnNoStoreMiddleware],
}));
