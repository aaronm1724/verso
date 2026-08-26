import { NextResponse, type NextRequest } from "next/server";
import { refreshSessionForProxy } from "@/lib/spotify/session";

// Next.js 16 renamed the pre-render primitive from middleware.ts to
// proxy.ts. This is the only context besides Route Handlers/Server Actions
// that can persist a cookie mutation, so it owns proactive Spotify token
// refresh before "/" renders. Matched only to "/" since that's the sole
// Phase 1 page that reads session state.
export async function proxy(request: NextRequest) {
  const response = NextResponse.next();
  await refreshSessionForProxy(request, response);
  return response;
}

export const config = {
  matcher: ["/"],
};
