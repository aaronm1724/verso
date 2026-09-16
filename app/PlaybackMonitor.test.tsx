/** @vitest-environment jsdom */

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentPlayback } from "@/lib/spotify/playback";
import { SYNCED_POLL_INTERVAL_MS, WATCH_POLL_INTERVAL_MS } from "@/lib/lyrics/playbackSync";

const { refresh, router } = vi.hoisted(() => {
  const refresh = vi.fn();
  return { refresh, router: { refresh } };
});

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

import { PlaybackMonitor } from "./PlaybackMonitor";
import { SyncedLyricsPlayer } from "./SyncedLyricsPlayer";

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

const playingB: CurrentPlayback = {
  ...playingA,
  track: { ...playingA.track, id: "track-b", name: "B" },
};

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function StubPlayer() {
  return <div>stub player</div>;
}

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["Date", "setInterval", "clearInterval"],
  });
  refresh.mockReset();
  fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true, data: playingA }));
  vi.stubGlobal("fetch", fetchMock);
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("PlaybackMonitor", () => {
  it("polls immediately and then on the provided interval, using a single fetch loop", async () => {
    render(
      <PlaybackMonitor
        initialPlayback={{ ok: true, data: playingA }}
        renderedTrackId="track-a"
        renderedPlaybackStatus="playing"
        pollIntervalMs={SYNCED_POLL_INTERVAL_MS}
      >
        <StubPlayer />
      </PlaybackMonitor>,
    );

    await flushAsyncWork();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/playback/current");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYNCED_POLL_INTERVAL_MS);
    });
    await flushAsyncWork();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYNCED_POLL_INTERVAL_MS);
    });
    await flushAsyncWork();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("honors a 5s watch-only interval", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: { status: "idle" } }));

    render(
      <PlaybackMonitor
        initialPlayback={{ ok: true, data: { status: "idle" } }}
        renderedTrackId={null}
        renderedPlaybackStatus="idle"
        pollIntervalMs={WATCH_POLL_INTERVAL_MS}
      >
        <StubPlayer />
      </PlaybackMonitor>,
    );

    await flushAsyncWork();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYNCED_POLL_INTERVAL_MS);
    });
    await flushAsyncWork();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WATCH_POLL_INTERVAL_MS - SYNCED_POLL_INTERVAL_MS);
    });
    await flushAsyncWork();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("calls router.refresh exactly once on idle → playing and then stops polling", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: playingA }));

    render(
      <PlaybackMonitor
        initialPlayback={{ ok: true, data: { status: "idle" } }}
        renderedTrackId={null}
        renderedPlaybackStatus="idle"
        pollIntervalMs={WATCH_POLL_INTERVAL_MS}
      >
        <StubPlayer />
      </PlaybackMonitor>,
    );

    await flushAsyncWork();
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WATCH_POLL_INTERVAL_MS * 2);
    });
    await flushAsyncWork();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("calls router.refresh exactly once on a track change", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: playingB }));

    render(
      <PlaybackMonitor
        initialPlayback={{ ok: true, data: playingA }}
        renderedTrackId="track-a"
        renderedPlaybackStatus="playing"
        pollIntervalMs={SYNCED_POLL_INTERVAL_MS}
      >
        <StubPlayer />
      </PlaybackMonitor>,
    );

    await flushAsyncWork();
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYNCED_POLL_INTERVAL_MS * 2);
    });
    await flushAsyncWork();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not call router.refresh again if the poll effect restarts after a refresh was requested", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: playingB }));

    const view = render(
      <PlaybackMonitor
        initialPlayback={{ ok: true, data: playingA }}
        renderedTrackId="track-a"
        renderedPlaybackStatus="playing"
        pollIntervalMs={SYNCED_POLL_INTERVAL_MS}
      >
        <StubPlayer />
      </PlaybackMonitor>,
    );

    await flushAsyncWork();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    view.rerender(
      <PlaybackMonitor
        initialPlayback={{ ok: true, data: playingA }}
        renderedTrackId="track-a"
        renderedPlaybackStatus="playing"
        pollIntervalMs={WATCH_POLL_INTERVAL_MS}
      >
        <StubPlayer />
      </PlaybackMonitor>,
    );

    await flushAsyncWork();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WATCH_POLL_INTERVAL_MS * 2);
    });
    await flushAsyncWork();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("calls router.refresh exactly once on reauth_required", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: false, reason: "reauth_required" }));

    render(
      <PlaybackMonitor
        initialPlayback={{ ok: true, data: playingA }}
        renderedTrackId="track-a"
        renderedPlaybackStatus="playing"
        pollIntervalMs={SYNCED_POLL_INTERVAL_MS}
      >
        <StubPlayer />
      </PlaybackMonitor>,
    );

    await flushAsyncWork();
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYNCED_POLL_INTERVAL_MS * 2);
    });
    await flushAsyncWork();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops fetching after unmount", async () => {
    const view = render(
      <PlaybackMonitor
        initialPlayback={{ ok: true, data: playingA }}
        renderedTrackId="track-a"
        renderedPlaybackStatus="playing"
        pollIntervalMs={SYNCED_POLL_INTERVAL_MS}
      >
        <StubPlayer />
      </PlaybackMonitor>,
    );

    await flushAsyncWork();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    view.unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYNCED_POLL_INTERVAL_MS * 3);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("triggers an extra poll when the tab becomes visible", async () => {
    render(
      <PlaybackMonitor
        initialPlayback={{ ok: true, data: playingA }}
        renderedTrackId="track-a"
        renderedPlaybackStatus="playing"
        pollIntervalMs={SYNCED_POLL_INTERVAL_MS}
      >
        <StubPlayer />
      </PlaybackMonitor>,
    );

    await flushAsyncWork();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flushAsyncWork();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not add a second /api/playback/current caller when wrapping SyncedLyricsPlayer", async () => {
    render(
      <PlaybackMonitor
        initialPlayback={{ ok: true, data: playingA }}
        renderedTrackId="track-a"
        renderedPlaybackStatus="playing"
        pollIntervalMs={SYNCED_POLL_INTERVAL_MS}
      >
        <SyncedLyricsPlayer
          trackId="track-a"
          durationMs={180_000}
          sourceLanguage="es"
          targetLanguage="en"
          lines={[
            { startTimeMs: 0, originalText: "Hola", translatedText: "Hello" },
            { startTimeMs: 5000, originalText: "Adios", translatedText: "Goodbye" },
          ]}
        />
      </PlaybackMonitor>,
    );

    await flushAsyncWork();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYNCED_POLL_INTERVAL_MS);
    });
    await flushAsyncWork();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([url]) => url === "/api/playback/current")).toBe(true);
  });
});
