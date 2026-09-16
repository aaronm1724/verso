/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LYRIC_TICK_MS, STALE_SNAPSHOT_MS } from "@/lib/lyrics/playbackSync";
import type { PlaybackSnapshot } from "@/lib/spotify/playbackTransition";

import { PlaybackSnapshotProvider } from "./PlaybackMonitor";
import { SyncedLyricsPlayer } from "./SyncedLyricsPlayer";

const lines = [
  { startTimeMs: 0, originalText: "First line", translatedText: "Primera" },
  { startTimeMs: 20_000, originalText: "Second line", translatedText: "Segunda" },
];

function renderPlayer(snapshot: PlaybackSnapshot | null) {
  return render(
    <PlaybackSnapshotProvider snapshot={snapshot}>
      <SyncedLyricsPlayer
        trackId="track-a"
        durationMs={180_000}
        lines={lines}
        sourceLanguage="en"
        targetLanguage="es"
      />
    </PlaybackSnapshotProvider>,
  );
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["Date", "setInterval", "clearInterval"],
  });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("SyncedLyricsPlayer", () => {
  it("does not fetch playback itself", async () => {
    const now = 100_000;
    vi.setSystemTime(now);
    renderPlayer({
      progressMs: 0,
      isPlaying: true,
      receivedAtMs: now,
      trackId: "track-a",
      durationMs: 180_000,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("highlights the active line from a playing context snapshot", async () => {
    const now = 100_000;
    vi.setSystemTime(now);
    renderPlayer({
      progressMs: 0,
      isPlaying: true,
      receivedAtMs: now,
      trackId: "track-a",
      durationMs: 180_000,
    });

    expect(screen.getByText("First line").className).toContain("text-zinc-50");
    expect(screen.getByText("Second line").className).toContain("text-zinc-300");

    await act(async () => {
      vi.setSystemTime(now + 20_000);
      await vi.advanceTimersByTimeAsync(LYRIC_TICK_MS);
    });

    expect(screen.getByText("Second line").className).toContain("text-zinc-50");
    expect(screen.getByText("First line").className).toContain("text-zinc-300");
  });

  it("freezes the highlighted line while paused", async () => {
    const now = 100_000;
    vi.setSystemTime(now);
    renderPlayer({
      progressMs: 0,
      isPlaying: false,
      receivedAtMs: now,
      trackId: "track-a",
      durationMs: 180_000,
    });

    await act(async () => {
      vi.setSystemTime(now + 25_000);
      await vi.advanceTimersByTimeAsync(LYRIC_TICK_MS);
    });

    expect(screen.getByText("First line").className).toContain("text-zinc-50");
    expect(screen.getByText("Second line").className).toContain("text-zinc-300");
  });

  it("freezes interpolation after the stale-snapshot threshold", async () => {
    const now = 100_000;
    vi.setSystemTime(now);
    renderPlayer({
      progressMs: 0,
      isPlaying: true,
      receivedAtMs: now - STALE_SNAPSHOT_MS - 1_000,
      trackId: "track-a",
      durationMs: 180_000,
    });

    expect(screen.getByText("First line").className).toContain("text-zinc-50");

    await act(async () => {
      vi.setSystemTime(now + 25_000);
      await vi.advanceTimersByTimeAsync(LYRIC_TICK_MS);
    });

    expect(screen.getByText("First line").className).toContain("text-zinc-50");
    expect(screen.getByText("Second line").className).toContain("text-zinc-300");
  });

  it("pauses auto-follow on a user scroll and resumes after the affordance is used", async () => {
    const now = 100_000;
    vi.setSystemTime(now);
    renderPlayer({
      progressMs: 0,
      isPlaying: true,
      receivedAtMs: now,
      trackId: "track-a",
      durationMs: 180_000,
    });

    await act(async () => {
      vi.setSystemTime(now + 700);
    });
    fireEvent.scroll(window);

    const resume = screen.getByRole("button", { name: "Resume following" });
    expect(resume).toBeTruthy();
    expect(resume.className).toContain("fixed");
    expect(resume.className).toContain("bottom-6");

    const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView);
    scrollIntoView.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Resume following" }));

    expect(screen.queryByRole("button", { name: "Resume following" })).toBeNull();
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
  });
});
