import { sealData } from "iron-session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SpotifySession } from "@/lib/spotify/session";

const TEST_SECRET = "c".repeat(32);
const SESSION_COOKIE_NAME = "verso_session";
const ACCESS_TOKEN = "secret-access-token-must-not-leak";
const REFRESH_TOKEN = "secret-refresh-token-must-not-leak";

let cookieValue: string | undefined;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === SESSION_COOKIE_NAME && cookieValue ? { name, value: cookieValue } : undefined,
    set: () => {},
    delete: () => {},
  }),
}));

async function setSessionCookie(spotify: SpotifySession): Promise<void> {
  cookieValue = await sealData({ spotify }, { password: TEST_SECRET });
}

beforeEach(() => {
  process.env.SPOTIFY_CLIENT_ID = "test-client-id";
  process.env.SPOTIFY_CLIENT_SECRET = "test-client-secret";
  process.env.SESSION_SECRET = TEST_SECRET;
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  cookieValue = undefined;
});

describe("GET /api/playback/current", () => {
  it("returns a normalized playback snapshot and never serializes session tokens", async () => {
    await setSessionCookie({
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
      expiresAt: Date.now() + 60 * 60 * 1000,
    });
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          is_playing: true,
          progress_ms: 1500,
          currently_playing_type: "track",
          item: {
            id: "track-1",
            name: "Song Title",
            duration_ms: 210_000,
            artists: [{ name: "Artist One" }],
            album: { name: "Album Name", images: [{ url: "https://img.example/a.jpg" }] },
          },
        }),
        { status: 200 },
      ),
    );

    const { GET } = await import("./route");
    const response = await GET();
    const body: unknown = await response.json();
    const serialized = JSON.stringify(body);

    expect(body).toEqual({
      ok: true,
      data: {
        status: "playing",
        progressMs: 1500,
        track: {
          id: "track-1",
          name: "Song Title",
          artistNames: ["Artist One"],
          albumName: "Album Name",
          albumImageUrl: "https://img.example/a.jpg",
          durationMs: 210_000,
        },
      },
    });
    expect(serialized).not.toContain(ACCESS_TOKEN);
    expect(serialized).not.toContain(REFRESH_TOKEN);
  });

  it("passes through reauth_required when the session cannot be used", async () => {
    const { GET } = await import("./route");
    const response = await GET();
    const body: unknown = await response.json();
    const serialized = JSON.stringify(body);

    expect(body).toEqual({ ok: false, reason: "reauth_required" });
    expect(serialized).not.toContain(ACCESS_TOKEN);
    expect(serialized).not.toContain(REFRESH_TOKEN);
  });
});
