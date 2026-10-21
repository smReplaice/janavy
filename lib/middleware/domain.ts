import { NextRequest, NextResponse } from "next/server";

import { BLOCKED_PATHNAMES } from "@/lib/constants";

/**
 * Fallback URL for custom-domain roots without a configured redirect.
 * Edge-safe (plain env reads only, no node APIs).
 */
export function janaviFallbackUrl(): string {
  return (
    process.env.NEXT_PUBLIC_MARKETING_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    "http://localhost:3000"
  );
}

export default async function DomainMiddleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const host = req.headers.get("host");

  // Root path of a custom domain: redirect to the app.
  //
  // JANAVI note: the Redis-backed per-domain redirect override
  // (lib/api/domains/redis.ts) is Node-runtime only — the Redis Cloud client
  // (ioredis) cannot run on the edge runtime, so the middleware always uses
  // the fallback URL. Document viewing on custom domains is unaffected.
  if (path === "/") {
    return NextResponse.redirect(new URL(janaviFallbackUrl(), req.url));
  }

  const url = req.nextUrl.clone();

  // Check for blocked pathnames
  if (BLOCKED_PATHNAMES.includes(path) || path.includes(".")) {
    url.pathname = "/404";
    return NextResponse.rewrite(url, { status: 404 });
  }

  // Rewrite the URL to the correct page component for custom domains
  // Rewrite to the pages/view/domains/[domain]/[slug] route
  url.pathname = `/view/domains/${host}${path}`;

  const headers: Record<string, string> = {
    "X-Robots-Tag": "noindex",
    "X-Powered-By": "JANAVI — Secure Document Infrastructure",
  };

  // Allow custom-domain embeds to be framed from any host, matching the
  // papermark.com `/view/:path*/embed` behavior. next.config `headers()` match
  // the external path (`/{slug}/embed`), so the framing header is set here.
  if (path.endsWith("/embed")) {
    headers["Content-Security-Policy"] = "frame-ancestors *;";
  }

  return NextResponse.rewrite(url, { headers });
}
