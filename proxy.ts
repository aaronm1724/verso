import { NextResponse, type NextRequest } from "next/server";
import { refreshSessionForProxy } from "@/lib/spotify/session";

// Next.js 16 renamed middleware.ts to proxy.ts. This is the only context
// besides Route Handlers and Server Actions that can persist a cookie
// mutation, so it owns proactive Spotify token refresh before "/" renders.
// The matcher is only "/" because that is the only page that reads the session.
export async function proxy(request: NextRequest) {
  const response = NextResponse.next();
  await refreshSessionForProxy(request, response);
  return response;
}

export const config = {
  matcher: ["/"],
};
