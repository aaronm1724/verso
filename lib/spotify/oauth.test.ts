import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAuthorizeUrl, computeExpiresAt, exchangeCodeForTokens, refreshAccessToken } from "./oauth";

beforeEach(() => {
  process.env.SPOTIFY_CLIENT_ID = "test-client-id";
  process.env.SPOTIFY_CLIENT_SECRET = "test-client-secret";
  process.env.SPOTIFY_REDIRECT_URI = "http://127.0.0.1:3000/api/auth/callback/spotify";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("computeExpiresAt", () => {
  it("adds expires_in seconds (converted to ms) to now", () => {
    expect(computeExpiresAt(3600, 1_000)).toBe(1_000 + 3_600_000);
  });
});

describe("buildAuthorizeUrl", () => {
  it("includes the minimal scope, client id, redirect uri, and state", () => {
    const url = new URL(buildAuthorizeUrl("abc123"));
    expect(url.origin + url.pathname).toBe("https://accounts.spotify.com/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("scope")).toBe("user-read-playback-state");
    expect(url.searchParams.get("redirect_uri")).toBe(process.env.SPOTIFY_REDIRECT_URI);
    expect(url.searchParams.get("state")).toBe("abc123");
  });
});

describe("exchangeCodeForTokens", () => {
  it("returns tokens on a successful exchange", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "access-1",
          token_type: "Bearer",
          scope: "user-read-playback-state",
          expires_in: 3600,
          refresh_token: "refresh-1",
        }),
        { status: 200 },
      ),
    );

    const result = await exchangeCodeForTokens("auth-code");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.accessToken).toBe("access-1");
      expect(result.refreshToken).toBe("refresh-1");
    }
  });

  it("fails when the token endpoint returns a non-2xx status", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 400 }));

    const result = await exchangeCodeForTokens("bad-code");

    expect(result).toEqual({ ok: false, reason: "token_exchange_failed" });
  });

  it("fails when no refresh_token is returned (would create an unrefreshable session)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "access-1", token_type: "Bearer", scope: "", expires_in: 3600 }),
        { status: 200 },
      ),
    );

    const result = await exchangeCodeForTokens("auth-code");

    expect(result).toEqual({ ok: false, reason: "token_exchange_failed" });
  });
});

describe("refreshAccessToken", () => {
  it("preserves the existing refresh token when Spotify omits a replacement", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "access-2", token_type: "Bearer", scope: "", expires_in: 3600 }),
        { status: 200 },
      ),
    );

    const result = await refreshAccessToken("old-refresh-token");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.accessToken).toBe("access-2");
      expect(result.refreshToken).toBe("old-refresh-token");
    }
  });

  it("uses the replacement refresh token when Spotify sends one", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "access-3",
          token_type: "Bearer",
          scope: "",
          expires_in: 3600,
          refresh_token: "new-refresh-token",
        }),
        { status: 200 },
      ),
    );

    const result = await refreshAccessToken("old-refresh-token");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.accessToken).toBe("access-3");
      expect(result.refreshToken).toBe("new-refresh-token");
    }
  });

  it("fails when the refresh token is invalid/expired", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 400 }));

    const result = await refreshAccessToken("bad-refresh-token");

    expect(result).toEqual({ ok: false, reason: "refresh_failed" });
  });
});
