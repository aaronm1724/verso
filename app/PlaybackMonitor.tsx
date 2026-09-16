"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import type { SpotifyRequestResult } from "@/lib/spotify/client";
import type { CurrentPlayback } from "@/lib/spotify/playback";
import {
  resolvePollOutcome,
  snapshotFromPlayback,
  type PlaybackSnapshot,
  type RenderedPlaybackIdentity,
} from "@/lib/spotify/playbackTransition";

const PlaybackSnapshotContext = createContext<PlaybackSnapshot | null>(null);

export function usePlaybackSnapshot(): PlaybackSnapshot | null {
  return useContext(PlaybackSnapshotContext);
}

export function PlaybackSnapshotProvider({
  snapshot,
  children,
}: {
  snapshot: PlaybackSnapshot | null;
  children: ReactNode;
}) {
  return <PlaybackSnapshotContext.Provider value={snapshot}>{children}</PlaybackSnapshotContext.Provider>;
}

function snapshotFromResult(
  result: SpotifyRequestResult<CurrentPlayback>,
  receivedAtMs: number,
): PlaybackSnapshot | null {
  if (!result.ok) {
    return null;
  }
  return snapshotFromPlayback(result.data, receivedAtMs);
}

export function PlaybackMonitor({
  children,
  initialPlayback,
  renderedTrackId,
  renderedPlaybackStatus,
  pollIntervalMs,
}: {
  children: ReactNode;
  initialPlayback: SpotifyRequestResult<CurrentPlayback>;
  renderedTrackId: string | null;
  renderedPlaybackStatus: RenderedPlaybackIdentity["playbackStatus"];
  pollIntervalMs: number;
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<PlaybackSnapshot | null>(() =>
    snapshotFromResult(initialPlayback, Date.now()),
  );
  const hasRequestedRefreshRef = useRef(false);
  const intervalRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Do not reset hasRequestedRefreshRef here. React Strict Mode re-runs this
    // effect in development; clearing the guard would let a second poll call
    // router.refresh() and abort the in-flight RSC stream.
    if (hasRequestedRefreshRef.current) {
      return;
    }

    const identity: RenderedPlaybackIdentity = {
      trackId: renderedTrackId,
      playbackStatus: renderedPlaybackStatus,
    };

    async function poll() {
      if (hasRequestedRefreshRef.current) {
        return;
      }

      let latest: SpotifyRequestResult<CurrentPlayback>;
      try {
        const response = await fetch("/api/playback/current");
        latest = (await response.json()) as SpotifyRequestResult<CurrentPlayback>;
      } catch {
        return;
      }

      if (hasRequestedRefreshRef.current) {
        return;
      }

      const outcome = resolvePollOutcome(identity, latest);
      if (outcome === "refresh") {
        hasRequestedRefreshRef.current = true;
        stopPolling();
        router.refresh();
        return;
      }

      if (outcome === "update_baseline" && latest.ok) {
        const next = snapshotFromPlayback(latest.data, Date.now());
        if (next) {
          setSnapshot(next);
        }
      }
    }

    void poll();
    intervalRef.current = window.setInterval(() => {
      void poll();
    }, pollIntervalMs);

    function onVisibility() {
      if (document.visibilityState === "visible") {
        void poll();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pollIntervalMs, renderedPlaybackStatus, renderedTrackId, router, stopPolling]);

  return <PlaybackSnapshotProvider snapshot={snapshot}>{children}</PlaybackSnapshotProvider>;
}
