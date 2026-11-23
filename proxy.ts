import { NextResponse, type NextRequest } from "next/server";
import { refreshSessionForProxy } from "@/lib/spotify/session";
import {
  isSupportedLanguageCode,
  LANGUAGE_COOKIE_MAX_AGE_SECONDS,
  LANGUAGE_COOKIE_NAME,
} from "@/lib/translation/languages";

// Next.js 16 renamed middleware.ts to proxy.ts. This is the only context
// besides Route Handlers and Server Actions that can persist a cookie
// mutation, so it owns proactive Spotify token refresh before "/" renders.
// The matcher is only "/" because that is the only page that reads the session.
export async function proxy(request: NextRequest) {
  const response = NextResponse.next();
  await refreshSessionForProxy(request, response);

  const requestedLanguage = request.nextUrl.searchParams.get("lang");
  if (requestedLanguage && isSupportedLanguageCode(requestedLanguage)) {
    response.cookies.set(LANGUAGE_COOKIE_NAME, requestedLanguage, {
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: LANGUAGE_COOKIE_MAX_AGE_SECONDS,
      path: "/",
    });
  }

  return response;
}

export const config = {
  matcher: ["/"],
};
