import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { needsRefresh, resolveAccessToken, type SpotifySession } from "./session";

beforeEach(() => {
  process.env.SPOTIFY_CLIENT_ID = "test-client-id";
  process.env.SPOTIFY_CLIENT_SECRET = "test-client-secret";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("needsRefresh", () => {
  it("is false well outside the refresh margin", () => {
    expect(needsRefresh(Date.now() + 60 * 60 * 1000)).toBe(false);
  });

  it("is true inside the refresh margin", () => {
    expect(needsRefresh(Date.now() + 30_000)).toBe(true);
  });

  it("is true once already expired", () => {
    expect(needsRefresh(Date.now() - 1_000)).toBe(true);
  });
});

describe("resolveAccessToken", () => {
  it("returns the existing token without refreshing when not near expiry", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const session: SpotifySession = {
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: Date.now() + 60 * 60 * 1000,
    };

    const result = await resolveAccessToken(session);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, accessToken: "access", session, refreshed: false });
  });

  it("refreshes and preserves the refresh token when the session is near expiry", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "new-access", token_type: "Bearer", scope: "", expires_in: 3600 }),
        { status: 200 },
      ),
    );
    const session: SpotifySession = {
      accessToken: "old-access",
      refreshToken: "refresh",
      expiresAt: Date.now() + 1_000,
    };

    const result = await resolveAccessToken(session);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.refreshed).toBe(true);
      expect(result.accessToken).toBe("new-access");
      expect(result.session.refreshToken).toBe("refresh");
    }
  });

  it("returns reauth_required when the refresh token is invalid", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 400 }));
    const session: SpotifySession = {
      accessToken: "old-access",
      refreshToken: "bad-refresh",
      expiresAt: Date.now() - 1_000,
    };

    const result = await resolveAccessToken(session);

    expect(result).toEqual({ ok: false, reason: "reauth_required" });
  });
});

describe("session cookie seal/unseal", () => {
  it("round-trips a SpotifySession via iron-session's sealData/unsealData", async () => {
    const { sealData, unsealData } = await import("iron-session");
    const password = "b".repeat(32);
    const spotify: SpotifySession = { accessToken: "access", refreshToken: "refresh", expiresAt: 12345 };

    const seal = await sealData({ spotify }, { password });
    const unsealed = await unsealData<{ spotify: SpotifySession }>(seal, { password });

    expect(unsealed).toEqual({ spotify });
  });
});
