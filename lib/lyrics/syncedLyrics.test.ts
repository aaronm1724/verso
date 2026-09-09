import { describe, expect, it } from "vitest";

import { parseSyncedLyrics } from "./syncedLyrics";

describe("parseSyncedLyrics", () => {
  it("parses multiple standard [mm:ss.xx]text lines into startTimeMs/text", () => {
    const raw = "[00:17.12] I feel your breath upon my neck\n[00:20.50] Second line";

    expect(parseSyncedLyrics(raw)).toEqual([
      { startTimeMs: 17_120, text: "I feel your breath upon my neck" },
      { startTimeMs: 20_500, text: "Second line" },
    ]);
  });

  it("handles 3-digit fractional seconds", () => {
    const raw = "[03:20.310] The clock won't stop and this is what we get";

    expect(parseSyncedLyrics(raw)).toEqual([
      { startTimeMs: 200_310, text: "The clock won't stop and this is what we get" },
    ]);
  });

  it("preserves a trailing timestamp-only line as an empty-text entry", () => {
    const raw = "[00:17.12] First line\n[03:25.72] ";

    expect(parseSyncedLyrics(raw)).toEqual([
      { startTimeMs: 17_120, text: "First line" },
      { startTimeMs: 205_720, text: "" },
    ]);
  });

  it("ignores non-timestamp metadata lines without erroring", () => {
    const raw = "[au: instrumental]\n[00:17.12] Actual lyric line";

    expect(parseSyncedLyrics(raw)).toEqual([{ startTimeMs: 17_120, text: "Actual lyric line" }]);
  });

  it("returns [] for blank/whitespace/garbage input", () => {
    expect(parseSyncedLyrics("")).toEqual([]);
    expect(parseSyncedLyrics("   \n  \n")).toEqual([]);
    expect(parseSyncedLyrics("not lyrics at all")).toEqual([]);
  });
});
