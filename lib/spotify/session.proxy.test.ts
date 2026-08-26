import { sealData, unsealData } from "iron-session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE_NAME, refreshSessionForProxy, type SpotifySession } from "./session";

// Exercises the proxy-only refresh-decision path using plain Fetch API
// Request/Response objects (NextRequest/NextResponse satisfy the same
// interface iron-session checks for), without depending on any Next.js
// runtime internals.

const TEST_SECRET = "a".repeat(32);

beforeEach(() => {
  process.env.SPOTIFY_CLIENT_ID = "test-client-id";
  process.env.SPOTIFY_CLIENT_SECRET = "test-client-secret";
  process.env.SESSION_SECRET = TEST_SECRET;
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function requestWithSession(spotify: SpotifySession | undefined): Promise<Request> {
  if (!spotify) {
    return new Request("https://verso.test/");
  }
  const seal = await sealData({ spotify }, { password: TEST_SECRET });
  return new Request("https://verso.test/", {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${seal}` },
  });
}

function getSetCookie(response: Response): string | undefined {
  return response.headers.getSetCookie?.()[0] ?? response.headers.get("set-cookie") ?? undefined;
}

describe("refreshSessionForProxy", () => {
  it("does nothing for an anonymous request", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const request = await requestWithSession(undefined);
    const response = new Response(null);

    await refreshSessionForProxy(request as never, response as never);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getSetCookie(response)).toBeUndefined();
  });

  it("does nothing when the session is not near expiry", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const request = await requestWithSession({
      accessToken: "old-token",
      refreshToken: "refresh-token",
      expiresAt: Date.now() + 60 * 60 * 1000,
    });
    const response = new Response(null);

    await refreshSessionForProxy(request as never, response as never);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getSetCookie(response)).toBeUndefined();
  });

  it("refreshes and persists a near-expiry session, preserving the refresh token", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "new-token", token_type: "Bearer", scope: "", expires_in: 3600 }),
        { status: 200 },
      ),
    );
    const request = await requestWithSession({
      accessToken: "old-token",
      refreshToken: "refresh-token",
      expiresAt: Date.now() + 1_000,
    });
    const response = new Response(null);

    await refreshSessionForProxy(request as never, response as never);

    const setCookie = getSetCookie(response);
    expect(setCookie).toBeTruthy();
    const seal = setCookie!.split(";")[0].split("=").slice(1).join("=");
    const unsealed = await unsealData<{ spotify?: SpotifySession }>(seal, { password: TEST_SECRET });
    expect(unsealed.spotify?.accessToken).toBe("new-token");
    expect(unsealed.spotify?.refreshToken).toBe("refresh-token");
  });

  it("clears the session when the refresh token is permanently invalid", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 400 }));
    const request = await requestWithSession({
      accessToken: "old-token",
      refreshToken: "bad-refresh-token",
      expiresAt: Date.now() - 1_000,
    });
    const response = new Response(null);

    await refreshSessionForProxy(request as never, response as never);

    const setCookie = getSetCookie(response);
    expect(setCookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=;`));
  });
});
