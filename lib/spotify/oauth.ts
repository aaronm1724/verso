const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";

// Proves the connected account via unscoped /v1/me fields (display name, id,
// images) without requesting the user's email or private profile data.
// user-read-playback-state is pre-requested now because Phase 2 needs it with
// confidence and re-consent would otherwise be required.
export const SPOTIFY_SCOPES = "user-read-playback-state";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function basicAuthHeader(): string {
  const clientId = requiredEnv("SPOTIFY_CLIENT_ID");
  const clientSecret = requiredEnv("SPOTIFY_CLIENT_SECRET");
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

export function computeExpiresAt(expiresInSeconds: number, now: number = Date.now()): number {
  return now + expiresInSeconds * 1000;
}

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: requiredEnv("SPOTIFY_CLIENT_ID"),
    scope: SPOTIFY_SCOPES,
    redirect_uri: requiredEnv("SPOTIFY_REDIRECT_URI"),
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

type SpotifyTokenResponse = {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token?: string;
};

export type TokenExchangeResult =
  | { ok: true; accessToken: string; refreshToken: string; expiresAt: number }
  | { ok: false; reason: "token_exchange_failed" };

export type TokenRefreshResult =
  | { ok: true; accessToken: string; refreshToken: string; expiresAt: number }
  | { ok: false; reason: "refresh_failed" };

async function postToTokenEndpoint(body: URLSearchParams): Promise<Response> {
  return fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
}

export async function exchangeCodeForTokens(code: string): Promise<TokenExchangeResult> {
  const response = await postToTokenEndpoint(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: requiredEnv("SPOTIFY_REDIRECT_URI"),
    }),
  );

  if (!response.ok) {
    return { ok: false, reason: "token_exchange_failed" };
  }

  const data = (await response.json()) as SpotifyTokenResponse;

  // The initial authorization_code exchange must always include a refresh
  // token; treat its absence as a failure rather than storing a session that
  // can never be refreshed.
  if (!data.refresh_token) {
    return { ok: false, reason: "token_exchange_failed" };
  }

  return {
    ok: true,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: computeExpiresAt(data.expires_in),
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenRefreshResult> {
  const response = await postToTokenEndpoint(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  );

  if (!response.ok) {
    return { ok: false, reason: "refresh_failed" };
  }

  const data = (await response.json()) as SpotifyTokenResponse;

  return {
    ok: true,
    accessToken: data.access_token,
    // Spotify's refresh response doesn't always include a new refresh_token;
    // callers preserve the previous one when this happens.
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: computeExpiresAt(data.expires_in),
  };
}
