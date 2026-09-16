import type { SpotifyRequestResult } from "./client";
import type { CurrentPlayback } from "./playback";

export type RenderedPlaybackIdentity = {
  trackId: string | null;
  playbackStatus: CurrentPlayback["status"] | "lookup_failed";
};

export type PollOutcome = "update_baseline" | "refresh" | "ignore";

function latestTrackId(playback: CurrentPlayback): string | null {
  if (playback.status === "playing" || playback.status === "paused") {
    return playback.track.id;
  }
  return null;
}

export function resolvePollOutcome(
  current: RenderedPlaybackIdentity,
  latest: SpotifyRequestResult<CurrentPlayback>,
): PollOutcome {
  if (!latest.ok) {
    return latest.reason === "reauth_required" ? "refresh" : "ignore";
  }

  const latestStatus = latest.data.status;
  const latestId = latestTrackId(latest.data);

  if (latestId !== current.trackId || latestStatus !== current.playbackStatus) {
    if (
      latestId !== null &&
      latestId === current.trackId &&
      (latestStatus === "playing" || latestStatus === "paused") &&
      (current.playbackStatus === "playing" || current.playbackStatus === "paused")
    ) {
      return "update_baseline";
    }
    return "refresh";
  }

  if (latestStatus === "playing" || latestStatus === "paused") {
    return "update_baseline";
  }

  return "ignore";
}

export function snapshotFromPlayback(
  playback: CurrentPlayback,
  receivedAtMs: number,
): PlaybackSnapshot | null {
  if (playback.status !== "playing" && playback.status !== "paused") {
    return null;
  }

  return {
    progressMs: playback.progressMs,
    isPlaying: playback.status === "playing",
    receivedAtMs,
    trackId: playback.track.id,
    durationMs: playback.track.durationMs,
  };
}

export type PlaybackSnapshot = {
  progressMs: number;
  isPlaying: boolean;
  receivedAtMs: number;
  trackId: string;
  durationMs: number;
};
