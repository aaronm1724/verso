import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { resolveRequestOrigin } from "@/lib/http";
import { exchangeCodeForTokens } from "@/lib/spotify/oauth";
import { saveSpotifySession } from "@/lib/spotify/session";
import { isValidState, STATE_COOKIE_NAME } from "@/lib/spotify/state";

function redirectHome(request: Request, spotifyError?: string): NextResponse {
  const url = new URL("/", resolveRequestOrigin(request));
  if (spotifyError) {
    url.searchParams.set("spotify_error", spotifyError);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE_NAME)?.value;
  cookieStore.delete(STATE_COOKIE_NAME);

  if (url.searchParams.get("error")) {
    return redirectHome(request, "denied");
  }

  const actualState = url.searchParams.get("state") ?? undefined;
  if (!isValidState(expectedState, actualState)) {
    return redirectHome(request, "state_mismatch");
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return redirectHome(request, "callback_failed");
  }

  const tokenResult = await exchangeCodeForTokens(code);
  if (!tokenResult.ok) {
    return redirectHome(request, "token_exchange_failed");
  }

  await saveSpotifySession({
    accessToken: tokenResult.accessToken,
    refreshToken: tokenResult.refreshToken,
    expiresAt: tokenResult.expiresAt,
  });

  return redirectHome(request);
}
