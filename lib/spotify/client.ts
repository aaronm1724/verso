import { forceRefreshAccessToken, getValidAccessToken } from "./session";

const API_BASE_URL = "https://api.spotify.com/v1";

export type SpotifyRequestResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "reauth_required" | "spotify_request_failed" };

async function requestWithToken(accessToken: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function spotifyFetch<T>(path: string, init?: RequestInit): Promise<SpotifyRequestResult<T | null>> {
  const token = await getValidAccessToken();
  if (!token.ok) {
    return token;
  }

  let response = await requestWithToken(token.accessToken, path, init);

  if (response.status === 401) {
    // getValidAccessToken() already refreshes proactively near expiry, so an
    // unexpected 401 here means Spotify invalidated the token early. Force
    // exactly one refresh and one retry — never more.
    const retryToken = await forceRefreshAccessToken();
    if (!retryToken.ok) {
      return retryToken;
    }
    response = await requestWithToken(retryToken.accessToken, path, init);
  }

  if (response.status === 401) {
    return { ok: false, reason: "reauth_required" };
  }

  if (!response.ok) {
    return { ok: false, reason: "spotify_request_failed" };
  }

  // A 204 has no body (e.g. /me/player with no active device). response.ok
  // is true for 204, so this must be checked before parsing JSON.
  if (response.status === 204) {
    return { ok: true, data: null };
  }

  const data = (await response.json()) as T;
  return { ok: true, data };
}

export type SpotifyProfile = {
  id: string;
  displayName: string | null;
  imageUrl: string | null;
};

type SpotifyMeResponse = {
  id: string;
  display_name: string | null;
  images?: { url: string }[];
};

export async function getCurrentUserProfile(): Promise<SpotifyRequestResult<SpotifyProfile>> {
  const result = await spotifyFetch<SpotifyMeResponse>("/me");
  if (!result.ok) {
    return result;
  }

  // /me always returns a body on success; a null here would mean Spotify
  // sent an unexpected 204, which we treat like any other bad response.
  if (!result.data) {
    return { ok: false, reason: "spotify_request_failed" };
  }

  return {
    ok: true,
    data: {
      id: result.data.id,
      displayName: result.data.display_name,
      imageUrl: result.data.images?.[0]?.url ?? null,
    },
  };
}
