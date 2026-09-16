import { describe, expect, it } from "vitest";

import type { CurrentPlayback } from "./playback";
import { resolvePollOutcome, snapshotFromPlayback } from "./playbackTransition";

const playingA: CurrentPlayback = {
  status: "playing",
  progressMs: 1000,
  track: {
    id: "track-a",
    name: "A",
    artistNames: ["Artist"],
    albumName: null,
    albumImageUrl: null,
    durationMs: 180_000,
  },
};

const pausedA: CurrentPlayback = { ...playingA, status: "paused", progressMs: 2000 };

const playingB: CurrentPlayback = {
  ...playingA,
  track: { ...playingA.track, id: "track-b", name: "B" },
};

describe("resolvePollOutcome", () => {
  it("updates the baseline for same-track playing → paused", () => {
    expect(
      resolvePollOutcome({ trackId: "track-a", playbackStatus: "playing" }, { ok: true, data: pausedA }),
    ).toBe("update_baseline");
  });

  it("updates the baseline for same-track paused → playing", () => {
    expect(
      resolvePollOutcome({ trackId: "track-a", playbackStatus: "paused" }, { ok: true, data: playingA }),
    ).toBe("update_baseline");
  });

  it("updates the baseline for same-track seek/drift while still playing", () => {
    expect(
      resolvePollOutcome(
        { trackId: "track-a", playbackStatus: "playing" },
        { ok: true, data: { ...playingA, progressMs: 40_000 } },
      ),
    ).toBe("update_baseline");
  });

  it("refreshes when the track id changes", () => {
    expect(
      resolvePollOutcome({ trackId: "track-a", playbackStatus: "playing" }, { ok: true, data: playingB }),
    ).toBe("refresh");
  });

  it("refreshes when idle becomes a playing track", () => {
    expect(
      resolvePollOutcome({ trackId: null, playbackStatus: "idle" }, { ok: true, data: playingA }),
    ).toBe("refresh");
  });

  it("refreshes when a playing track becomes idle", () => {
    expect(
      resolvePollOutcome({ trackId: "track-a", playbackStatus: "playing" }, { ok: true, data: { status: "idle" } }),
    ).toBe("refresh");
  });

  it("refreshes when non_track becomes a music track", () => {
    expect(
      resolvePollOutcome({ trackId: null, playbackStatus: "non_track" }, { ok: true, data: playingA }),
    ).toBe("refresh");
  });

  it("ignores an unchanged idle snapshot", () => {
    expect(
      resolvePollOutcome({ trackId: null, playbackStatus: "idle" }, { ok: true, data: { status: "idle" } }),
    ).toBe("ignore");
  });

  it("refreshes on reauth_required", () => {
    expect(
      resolvePollOutcome(
        { trackId: "track-a", playbackStatus: "playing" },
        { ok: false, reason: "reauth_required" },
      ),
    ).toBe("refresh");
  });

  it("ignores a transient Spotify request failure", () => {
    expect(
      resolvePollOutcome(
        { trackId: "track-a", playbackStatus: "playing" },
        { ok: false, reason: "spotify_request_failed" },
      ),
    ).toBe("ignore");
  });

  it("refreshes when a playing track becomes unavailable", () => {
    expect(
      resolvePollOutcome(
        { trackId: "track-a", playbackStatus: "playing" },
        { ok: true, data: { status: "unavailable" } },
      ),
    ).toBe("refresh");
  });
});

describe("snapshotFromPlayback", () => {
  it("maps a playing track into a client snapshot", () => {
    expect(snapshotFromPlayback(playingA, 123)).toEqual({
      progressMs: 1000,
      isPlaying: true,
      receivedAtMs: 123,
      trackId: "track-a",
      durationMs: 180_000,
    });
  });

  it("returns null for idle playback", () => {
    expect(snapshotFromPlayback({ status: "idle" }, 123)).toBeNull();
  });
});
