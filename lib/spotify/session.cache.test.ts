import { sealData } from "iron-session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SpotifySession } from "./session";

const TEST_SECRET = "c".repeat(32);
const SESSION_COOKIE_NAME = "verso_session";

// React's cache() only dedupes inside an actual React Server Component
// render pass; a plain Vitest import has no such render context (verified
// directly: calling the real cache() outside of Next's runtime does not
// memoize at all). This mock substitutes a real single-flight memoizer so
// this file can test our own code against React's documented dedup
// contract — that repeated calls to a memoized no-argument function within
// one scope share a single resolution/refresh, and that a fresh scope
// (simulating a new request, via vi.resetModules()) does not reuse a prior
// scope's result. It does NOT prove that React/Next's actual runtime
// provides that per-request scope correctly — that guarantee is supplied
// by React/Next itself, not by anything under test here.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache<T extends () => unknown>(fn: T): T {
      let memoized: ReturnType<T> | undefined;
      return (() => {
        if (memoized === undefined) {
          memoized = fn() as ReturnType<T>;
        }
        return memoized;
      }) as T;
    },
  };
});

let cookieValue: string | undefined;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === SESSION_COOKIE_NAME && cookieValue ? { name, value: cookieValue } : undefined,
    // Mirrors the real Server Component context: writes are accepted
    // without error here (unlike Next's real read-only cookie jar), but
    // getValidAccessToken()'s bestEffortPersist() tolerates either outcome.
    set: () => {},
  }),
}));

async function setSessionCookie(spotify: SpotifySession): Promise<void> {
  cookieValue = await sealData({ spotify }, { password: TEST_SECRET });
}

beforeEach(() => {
  process.env.SPOTIFY_CLIENT_ID = "test-client-id";
  process.env.SPOTIFY_CLIENT_SECRET = "test-client-secret";
  process.env.SESSION_SECRET = TEST_SECRET;
  // Each test simulates a separate incoming request: a fresh module means a
  // fresh cache() memo, matching the real per-request-render-pass scope.
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  cookieValue = undefined;
});

describe("getValidAccessToken request-scoped memoization", () => {
  it("refreshes a near-expiry session only once even when called concurrently by two callers", async () => {
    await setSessionCookie({
      accessToken: "old-token",
      refreshToken: "refresh-token",
      expiresAt: Date.now() + 1_000,
    });
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "new-token", token_type: "Bearer", scope: "", expires_in: 3600 }),
        { status: 200 },
      ),
    );

    const { getValidAccessToken } = await import("./session");
    const [first, second] = await Promise.all([getValidAccessToken(), getValidAccessToken()]);

    expect(first).toEqual({ ok: true, accessToken: "new-token" });
    expect(second).toEqual({ ok: true, accessToken: "new-token" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("does not call Spotify at all when a second caller reuses an already-valid, non-expiring session", async () => {
    await setSessionCookie({
      accessToken: "still-good-token",
      refreshToken: "refresh-token",
      expiresAt: Date.now() + 60 * 60 * 1000,
    });
    const fetchSpy = vi.spyOn(global, "fetch");

    const { getValidAccessToken } = await import("./session");
    const [first, second] = await Promise.all([getValidAccessToken(), getValidAccessToken()]);

    expect(first).toEqual({ ok: true, accessToken: "still-good-token" });
    expect(second).toEqual(first);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not leak a resolved token across separate simulated requests", async () => {
    await setSessionCookie({
      accessToken: "request-one-token",
      refreshToken: "refresh-token",
      expiresAt: Date.now() + 60 * 60 * 1000,
    });
    const { getValidAccessToken: firstRequestToken } = await import("./session");
    const firstResult = await firstRequestToken();

    vi.resetModules();
    await setSessionCookie({
      accessToken: "request-two-token",
      refreshToken: "refresh-token",
      expiresAt: Date.now() + 60 * 60 * 1000,
    });
    const { getValidAccessToken: secondRequestToken } = await import("./session");
    const secondResult = await secondRequestToken();

    expect(firstResult).toEqual({ ok: true, accessToken: "request-one-token" });
    expect(secondResult).toEqual({ ok: true, accessToken: "request-two-token" });
  });
});

describe("forceRefreshAccessToken request-scoped memoization", () => {
  it("only calls Spotify once across multiple forced-refresh calls in the same simulated request", async () => {
    await setSessionCookie({
      accessToken: "stale-token",
      refreshToken: "refresh-token",
      expiresAt: Date.now() + 60 * 60 * 1000,
    });
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "forced-fresh-token", token_type: "Bearer", scope: "", expires_in: 3600 }),
        { status: 200 },
      ),
    );

    const { forceRefreshAccessToken } = await import("./session");
    const [first, second] = await Promise.all([forceRefreshAccessToken(), forceRefreshAccessToken()]);

    expect(first).toEqual({ ok: true, accessToken: "forced-fresh-token" });
    expect(second).toEqual(first);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
