import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./session", () => ({
  getValidAccessToken: vi.fn(),
  forceRefreshAccessToken: vi.fn(),
}));

import { forceRefreshAccessToken, getValidAccessToken } from "./session";
import { getCurrentUserProfile, spotifyFetch } from "./client";

const mockedGetValidAccessToken = vi.mocked(getValidAccessToken);
const mockedForceRefresh = vi.mocked(forceRefreshAccessToken);

afterEach(() => {
  vi.restoreAllMocks();
  mockedGetValidAccessToken.mockReset();
  mockedForceRefresh.mockReset();
});

describe("spotifyFetch", () => {
  it("returns reauth_required immediately when there is no session, without calling Spotify", async () => {
    mockedGetValidAccessToken.mockResolvedValue({ ok: false, reason: "reauth_required" });
    const fetchSpy = vi.spyOn(global, "fetch");

    const result = await spotifyFetch("/me");

    expect(result).toEqual({ ok: false, reason: "reauth_required" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns data on a successful first request", async () => {
    mockedGetValidAccessToken.mockResolvedValue({ ok: true, accessToken: "token-1" });
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ hello: "world" }), { status: 200 }),
    );

    const result = await spotifyFetch("/me");

    expect(result).toEqual({ ok: true, data: { hello: "world" } });
  });

  it("forces exactly one refresh and retries once after an unexpected 401, then succeeds", async () => {
    mockedGetValidAccessToken.mockResolvedValue({ ok: true, accessToken: "stale-token" });
    mockedForceRefresh.mockResolvedValue({ ok: true, accessToken: "fresh-token" });
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "u1" }), { status: 200 }));

    const result = await spotifyFetch("/me");

    expect(mockedForceRefresh).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true, data: { id: "u1" } });
  });

  it("does not attempt a third request when the retried request also fails", async () => {
    mockedGetValidAccessToken.mockResolvedValue({ ok: true, accessToken: "stale-token" });
    mockedForceRefresh.mockResolvedValue({ ok: true, accessToken: "still-bad-token" });
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));

    const result = await spotifyFetch("/me");

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(mockedForceRefresh).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: false, reason: "reauth_required" });
  });

  it("returns reauth_required without retrying when the forced refresh itself fails", async () => {
    mockedGetValidAccessToken.mockResolvedValue({ ok: true, accessToken: "stale-token" });
    mockedForceRefresh.mockResolvedValue({ ok: false, reason: "reauth_required" });
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(new Response(null, { status: 401 }));

    const result = await spotifyFetch("/me");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: false, reason: "reauth_required" });
  });

  it("returns spotify_request_failed for other error statuses", async () => {
    mockedGetValidAccessToken.mockResolvedValue({ ok: true, accessToken: "token-1" });
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 500 }));

    const result = await spotifyFetch("/me");

    expect(result).toEqual({ ok: false, reason: "spotify_request_failed" });
  });

  it("returns a successful null result on 204 without attempting to parse a body", async () => {
    mockedGetValidAccessToken.mockResolvedValue({ ok: true, accessToken: "token-1" });
    const response = new Response(null, { status: 204 });
    const jsonSpy = vi.spyOn(response, "json");
    vi.spyOn(global, "fetch").mockResolvedValue(response);

    const result = await spotifyFetch("/me/player");

    expect(result).toEqual({ ok: true, data: null });
    expect(jsonSpy).not.toHaveBeenCalled();
  });
});

describe("getCurrentUserProfile", () => {
  it("normalizes the /me response into a SpotifyProfile using only unscoped fields", async () => {
    mockedGetValidAccessToken.mockResolvedValue({ ok: true, accessToken: "token-1" });
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ id: "u1", display_name: "Alex", images: [{ url: "https://img.example/a.jpg" }] }),
        { status: 200 },
      ),
    );

    const result = await getCurrentUserProfile();

    expect(result).toEqual({
      ok: true,
      data: { id: "u1", displayName: "Alex", imageUrl: "https://img.example/a.jpg" },
    });
  });

  it("passes through a reauth_required result without calling Spotify", async () => {
    mockedGetValidAccessToken.mockResolvedValue({ ok: false, reason: "reauth_required" });
    const fetchSpy = vi.spyOn(global, "fetch");

    const result = await getCurrentUserProfile();

    expect(result).toEqual({ ok: false, reason: "reauth_required" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
