import { afterEach, describe, expect, it, vi } from "vitest";

import packageJson from "../../package.json";
import type { SpotifyTrack } from "../spotify/playback";
import { getLyricsForTrack } from "./lrclib";

const track: SpotifyTrack = {
  id: "track-1",
  name: "Song Title",
  artistNames: ["Primary Artist", "Featured Artist"],
  albumName: "Album Name",
  albumImageUrl: null,
  durationMs: 210_000,
};

function mockLrclibResponse(body: unknown, status = 200): void {
  vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getLyricsForTrack", () => {
  it("returns synced with plainText from plainLyrics when both are present and instrumental is false", async () => {
    mockLrclibResponse({
      instrumental: false,
      plainLyrics: "I feel your breath upon my neck",
      syncedLyrics: "[00:17.12] I feel your breath upon my neck\n[00:20.00] ",
    });

    const result = await getLyricsForTrack(track);

    expect(result).toEqual({
      ok: true,
      data: {
        status: "synced",
        lines: [
          { startTimeMs: 17_120, text: "I feel your breath upon my neck" },
          { startTimeMs: 20_000, text: "" },
        ],
        plainText: "I feel your breath upon my neck",
      },
    });
  });

  it("derives plainText from parsed synced lines when plainLyrics is null, without discarding the synced match", async () => {
    mockLrclibResponse({
      instrumental: false,
      plainLyrics: null,
      syncedLyrics: "[00:17.12] Line one\n[00:20.00] Line two",
    });

    const result = await getLyricsForTrack(track);

    expect(result).toEqual({
      ok: true,
      data: {
        status: "synced",
        lines: [
          { startTimeMs: 17_120, text: "Line one" },
          { startTimeMs: 20_000, text: "Line two" },
        ],
        plainText: "Line one\nLine two",
      },
    });
  });

  it("returns plain when only plainLyrics is present", async () => {
    mockLrclibResponse({ instrumental: false, plainLyrics: "Plain text only", syncedLyrics: null });

    const result = await getLyricsForTrack(track);

    expect(result).toEqual({ ok: true, data: { status: "plain", text: "Plain text only" } });
  });

  it("strips per-line ^translation suffixes from plain lyrics without collapsing the rest of the song", async () => {
    mockLrclibResponse({
      instrumental: false,
      plainLyrics: "Otra vez me llamaste^You called me again\nSiguiente linea",
      syncedLyrics: null,
    });

    const result = await getLyricsForTrack(track);

    expect(result).toEqual({
      ok: true,
      data: { status: "plain", text: "Otra vez me llamaste\nSiguiente linea" },
    });
  });

  it("returns instrumental regardless of lyric text content", async () => {
    mockLrclibResponse({ instrumental: true, plainLyrics: "should be ignored", syncedLyrics: null });

    const result = await getLyricsForTrack(track);

    expect(result).toEqual({ ok: true, data: { status: "instrumental" } });
  });

  it("returns not_found on a 404", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ message: "not found" }), { status: 404 }));

    const result = await getLyricsForTrack(track);

    expect(result).toEqual({ ok: true, data: { status: "not_found" } });
  });

  it("returns unavailable when all lyric fields are empty and instrumental is false", async () => {
    mockLrclibResponse({ instrumental: false, plainLyrics: "", syncedLyrics: "" });

    const result = await getLyricsForTrack(track);

    expect(result).toEqual({ ok: true, data: { status: "unavailable" } });
  });

  it("falls back to plain when syncedLyrics parses to zero usable lines", async () => {
    mockLrclibResponse({
      instrumental: false,
      plainLyrics: "Plain fallback text",
      syncedLyrics: "[au: instrumental]",
    });

    const result = await getLyricsForTrack(track);

    expect(result).toEqual({ ok: true, data: { status: "plain", text: "Plain fallback text" } });
  });

  it("falls back to unavailable when syncedLyrics parses to zero lines and plainLyrics is also empty", async () => {
    mockLrclibResponse({ instrumental: false, plainLyrics: "", syncedLyrics: "[au: instrumental]" });

    const result = await getLyricsForTrack(track);

    expect(result).toEqual({ ok: true, data: { status: "unavailable" } });
  });

  it.each([500, 429])("returns lookup_failed for a non-404 error status (%s)", async (status) => {
    mockLrclibResponse({ message: "error" }, status);

    const result = await getLyricsForTrack(track);

    expect(result).toEqual({ ok: false, reason: "lookup_failed" });
  });

  it("returns lookup_failed on a network error", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("network down"));

    const result = await getLyricsForTrack(track);

    expect(result).toEqual({ ok: false, reason: "lookup_failed" });
  });

  it("returns lookup_failed on malformed JSON in an otherwise-successful response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("not json", { status: 200 }));

    const result = await getLyricsForTrack(track);

    expect(result).toEqual({ ok: false, reason: "lookup_failed" });
  });

  it("builds the request with primary artist only, album name, rounded duration, and a compliant User-Agent", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ instrumental: false, plainLyrics: "text", syncedLyrics: null }), { status: 200 }),
    );

    await getLyricsForTrack(track);

    const [url, init] = spy.mock.calls[0];
    const requestUrl = new URL(url as string);

    expect(requestUrl.origin + requestUrl.pathname).toBe("https://lrclib.net/api/get");
    expect(requestUrl.searchParams.get("track_name")).toBe("Song Title");
    expect(requestUrl.searchParams.get("artist_name")).toBe("Primary Artist");
    expect(requestUrl.searchParams.get("album_name")).toBe("Album Name");
    expect(requestUrl.searchParams.get("duration")).toBe("210");
    expect((init?.headers as Record<string, string>)["User-Agent"]).toBe(
      `Verso/${packageJson.version} (${packageJson.homepage})`,
    );
  });

  it("omits album_name when the track has no album", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ instrumental: false, plainLyrics: "text", syncedLyrics: null }), { status: 200 }),
    );

    await getLyricsForTrack({ ...track, albumName: null });

    const [url] = spy.mock.calls[0];
    const requestUrl = new URL(url as string);

    expect(requestUrl.searchParams.has("album_name")).toBe(false);
  });
});
