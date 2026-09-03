import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./session", () => ({
  getValidAccessToken: vi.fn(),
  forceRefreshAccessToken: vi.fn(),
}));

import { getValidAccessToken } from "./session";
import { getCurrentPlayback } from "./playback";

const mockedGetValidAccessToken = vi.mocked(getValidAccessToken);

function mockSpotifyResponse(body: unknown, status = 200): void {
  vi.spyOn(global, "fetch").mockResolvedValue(
    body === null ? new Response(null, { status }) : new Response(JSON.stringify(body), { status }),
  );
}

const validTrackItem = {
  id: "track-1",
  name: "Song Title",
  duration_ms: 210_000,
  artists: [{ name: "Artist One" }, { name: "Artist Two" }],
  album: {
    name: "Album Name",
    images: [{ url: "https://img.example/large.jpg" }, { url: "https://img.example/small.jpg" }],
  },
};

afterEach(() => {
  vi.restoreAllMocks();
  mockedGetValidAccessToken.mockReset();
});

describe("getCurrentPlayback", () => {
  it("requests additional_types=episode so podcast episodes are represented in the response", async () => {
    mockedGetValidAccessToken.mockResolvedValue({ ok: true, accessToken: "token-1" });
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    await getCurrentPlayback();

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/me/player?additional_types=episode"),
      expect.anything(),
    );
  });

  it("returns idle on a 204 (no active device)", async () => {
    mockedGetValidAccessToken.mockResolvedValue({ ok: true, accessToken: "token-1" });
    mockSpotifyResponse(null, 204);

    const result = await getCurrentPlayback();

    expect(result).toEqual({ ok: true, data: { status: "idle" } });
  });

  it("returns idle when currently_playing_type is track but item is null", async () => {
    mockedGetValidAccessToken.mockResolvedValue({ ok: true, accessToken: "token-1" });
    mockSpotifyResponse({ is_playing: false, progress_ms: null, currently_playing_type: "track", item: null });

    const result = await getCurrentPlayback();

    expect(result).toEqual({ ok: true, data: { status: "idle" } });
  });

  it.each(["episode", "ad", "unknown"])(
    "returns non_track for currently_playing_type %s with a well-formed item",
    async (currentlyPlayingType) => {
      mockedGetValidAccessToken.mockResolvedValue({ ok: true, accessToken: "token-1" });
      mockSpotifyResponse({
        is_playing: true,
        progress_ms: 1000,
        currently_playing_type: currentlyPlayingType,
        item: validTrackItem,
      });

      const result = await getCurrentPlayback();

      expect(result).toEqual({ ok: true, data: { status: "non_track" } });
    },
  );

  it.each(["ad", "unknown"])(
    "returns non_track (not idle) for currently_playing_type %s even when item is null, as Spotify actually returns for ads/unknown content",
    async (currentlyPlayingType) => {
      mockedGetValidAccessToken.mockResolvedValue({ ok: true, accessToken: "token-1" });
      mockSpotifyResponse({
        is_playing: true,
        progress_ms: 0,
        currently_playing_type: currentlyPlayingType,
        item: null,
      });

      const result = await getCurrentPlayback();

      expect(result).toEqual({ ok: true, data: { status: "non_track" } });
    },
  );

  it("returns unavailable when currently_playing_type is track but required fields are missing", async () => {
    mockedGetValidAccessToken.mockResolvedValue({ ok: true, accessToken: "token-1" });
    mockSpotifyResponse({
      is_playing: true,
      progress_ms: 0,
      currently_playing_type: "track",
      item: { id: "track-1", name: "Song Title" }, // missing duration_ms and artists
    });

    const result = await getCurrentPlayback();

    expect(result).toEqual({ ok: true, data: { status: "unavailable" } });
  });

  it("returns unavailable when the item has no usable artist name", async () => {
    mockedGetValidAccessToken.mockResolvedValue({ ok: true, accessToken: "token-1" });
    mockSpotifyResponse({
      is_playing: true,
      progress_ms: 0,
      currently_playing_type: "track",
      item: { ...validTrackItem, artists: [{}] },
    });

    const result = await getCurrentPlayback();

    expect(result).toEqual({ ok: true, data: { status: "unavailable" } });
  });

  it("normalizes a playing track with album name/artwork degraded to null when absent", async () => {
    mockedGetValidAccessToken.mockResolvedValue({ ok: true, accessToken: "token-1" });
    const itemWithoutAlbum = {
      id: validTrackItem.id,
      name: validTrackItem.name,
      duration_ms: validTrackItem.duration_ms,
      artists: validTrackItem.artists,
    };
    mockSpotifyResponse({
      is_playing: true,
      progress_ms: 45_000,
      currently_playing_type: "track",
      item: itemWithoutAlbum,
    });

    const result = await getCurrentPlayback();

    expect(result).toEqual({
      ok: true,
      data: {
        status: "playing",
        track: {
          id: "track-1",
          name: "Song Title",
          artistNames: ["Artist One", "Artist Two"],
          albumName: null,
          albumImageUrl: null,
          durationMs: 210_000,
        },
        progressMs: 45_000,
      },
    });
  });

  it("normalizes a fully-populated playing track, using the first album image and defaulting null progress to 0", async () => {
    mockedGetValidAccessToken.mockResolvedValue({ ok: true, accessToken: "token-1" });
    mockSpotifyResponse({
      is_playing: true,
      progress_ms: null,
      currently_playing_type: "track",
      item: validTrackItem,
    });

    const result = await getCurrentPlayback();

    expect(result).toEqual({
      ok: true,
      data: {
        status: "playing",
        track: {
          id: "track-1",
          name: "Song Title",
          artistNames: ["Artist One", "Artist Two"],
          albumName: "Album Name",
          albumImageUrl: "https://img.example/large.jpg",
          durationMs: 210_000,
        },
        progressMs: 0,
      },
    });
  });

  it("normalizes a paused track", async () => {
    mockedGetValidAccessToken.mockResolvedValue({ ok: true, accessToken: "token-1" });
    mockSpotifyResponse({
      is_playing: false,
      progress_ms: 12_000,
      currently_playing_type: "track",
      item: validTrackItem,
    });

    const result = await getCurrentPlayback();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        status: "paused",
        track: expect.objectContaining({ id: "track-1" }),
        progressMs: 12_000,
      });
    }
  });

  it("passes through a reauth_required result without calling Spotify", async () => {
    mockedGetValidAccessToken.mockResolvedValue({ ok: false, reason: "reauth_required" });
    const fetchSpy = vi.spyOn(global, "fetch");

    const result = await getCurrentPlayback();

    expect(result).toEqual({ ok: false, reason: "reauth_required" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns spotify_request_failed for other error statuses", async () => {
    mockedGetValidAccessToken.mockResolvedValue({ ok: true, accessToken: "token-1" });
    mockSpotifyResponse(null, 500);

    const result = await getCurrentPlayback();

    expect(result).toEqual({ ok: false, reason: "spotify_request_failed" });
  });
});
