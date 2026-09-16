import { describe, expect, it } from "vitest";

import { parseSyncedLyrics, stripInlineLrcTranslation } from "./syncedLyrics";

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

describe("stripInlineLrcTranslation", () => {
  it("keeps the sung original when a Traly-style ^translation suffix is present", () => {
    expect(stripInlineLrcTranslation("Otra vez me llamaste^You called me again")).toBe(
      "Otra vez me llamaste",
    );
  });

  it("strips a spaced ^translation suffix", () => {
    expect(stripInlineLrcTranslation("Otra vez me llamaste ^ You called me again")).toBe(
      "Otra vez me llamaste",
    );
  });

  it("leaves text without a bilingual suffix unchanged", () => {
    expect(stripInlineLrcTranslation("Otra vez me llamaste")).toBe("Otra vez me llamaste");
    expect(stripInlineLrcTranslation("caret^")).toBe("caret^");
    expect(stripInlineLrcTranslation("^only suffix")).toBe("^only suffix");
  });
});

describe("parseSyncedLyrics bilingual suffixes", () => {
  it("strips ^translation from timestamped lines so OpenAI never sees the embedded English", () => {
    const raw = "[00:12.00] Otra vez me llamaste^You called me again\n[00:16.00] Second line";

    expect(parseSyncedLyrics(raw)).toEqual([
      { startTimeMs: 12_000, text: "Otra vez me llamaste" },
      { startTimeMs: 16_000, text: "Second line" },
    ]);
  });
});
