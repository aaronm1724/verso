import { describe, expect, it } from "vitest";

import { estimateProgressMs, getActiveLyricIndex, isSnapshotStale, STALE_SNAPSHOT_MS } from "./playbackSync";

const lines = [
  { startTimeMs: 0, text: "one" },
  { startTimeMs: 1000, text: "" },
  { startTimeMs: 2000, text: "three" },
  { startTimeMs: 2000, text: "three-dup" },
  { startTimeMs: 4000, text: "five" },
];

describe("getActiveLyricIndex", () => {
  it("returns -1 before the first lyric starts", () => {
    expect(getActiveLyricIndex([{ startTimeMs: 500 }], 0)).toBe(-1);
  });

  it("returns the first line at its exact timestamp", () => {
    expect(getActiveLyricIndex(lines, 0)).toBe(0);
  });

  it("returns the last matching index at a duplicate timestamp", () => {
    expect(getActiveLyricIndex(lines, 2000)).toBe(3);
  });

  it("returns a blank/gap line while its window is current", () => {
    expect(getActiveLyricIndex(lines, 1500)).toBe(1);
  });

  it("stays on the last line after the final timestamp", () => {
    expect(getActiveLyricIndex(lines, 99_000)).toBe(4);
  });

  it("advances at the next line's timestamp", () => {
    expect(getActiveLyricIndex(lines, 999)).toBe(0);
    expect(getActiveLyricIndex(lines, 1000)).toBe(1);
  });
});

describe("estimateProgressMs", () => {
  it("advances from the snapshot while playing", () => {
    expect(
      estimateProgressMs({ progressMs: 1000, isPlaying: true, receivedAtMs: 10_000 }, 10_500, 10_000),
    ).toBe(1500);
  });

  it("stays frozen while paused", () => {
    expect(
      estimateProgressMs({ progressMs: 1000, isPlaying: false, receivedAtMs: 10_000 }, 12_000, 10_000),
    ).toBe(1000);
  });

  it("clamps to the track duration", () => {
    expect(
      estimateProgressMs({ progressMs: 9_500, isPlaying: true, receivedAtMs: 0 }, 2000, 10_000),
    ).toBe(10_000);
  });

  it("clamps a negative estimate to 0", () => {
    expect(
      estimateProgressMs({ progressMs: 0, isPlaying: true, receivedAtMs: 1000 }, 0, 10_000),
    ).toBe(0);
  });
});

describe("isSnapshotStale", () => {
  it("is false within the stale window", () => {
    expect(isSnapshotStale(0, STALE_SNAPSHOT_MS)).toBe(false);
  });

  it("is true once the stale window is exceeded", () => {
    expect(isSnapshotStale(0, STALE_SNAPSHOT_MS + 1)).toBe(true);
  });
});
