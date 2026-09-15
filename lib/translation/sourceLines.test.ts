import { describe, expect, it } from "vitest";

import type { LyricsLookupResult } from "../lyrics/types";
import { extractSourceLines } from "./sourceLines";

describe("extractSourceLines", () => {
  it("preserves order for synced lyrics", () => {
    const lyrics: LyricsLookupResult = {
      ok: true,
      data: {
        status: "synced",
        plainText: "Line one\nLine two\nLine three",
        lines: [
          { startTimeMs: 0, text: "Line one" },
          { startTimeMs: 1000, text: "Line two" },
          { startTimeMs: 2000, text: "Line three" },
        ],
      },
    };

    expect(extractSourceLines(lyrics)).toEqual(["Line one", "Line two", "Line three"]);
  });

  it("preserves blank synced lines in position", () => {
    const lyrics: LyricsLookupResult = {
      ok: true,
      data: {
        status: "synced",
        plainText: "Line one",
        lines: [
          { startTimeMs: 0, text: "Line one" },
          { startTimeMs: 1000, text: "" },
          { startTimeMs: 2000, text: "Line three" },
        ],
      },
    };

    expect(extractSourceLines(lyrics)).toEqual(["Line one", "", "Line three"]);
  });

  it("splits plain lyrics by newline", () => {
    const lyrics: LyricsLookupResult = {
      ok: true,
      data: { status: "plain", text: "Line one\nLine two\nLine three" },
    };

    expect(extractSourceLines(lyrics)).toEqual(["Line one", "Line two", "Line three"]);
  });

  it("returns null for instrumental", () => {
    const lyrics: LyricsLookupResult = { ok: true, data: { status: "instrumental" } };
    expect(extractSourceLines(lyrics)).toBeNull();
  });

  it("returns null for not_found", () => {
    const lyrics: LyricsLookupResult = { ok: true, data: { status: "not_found" } };
    expect(extractSourceLines(lyrics)).toBeNull();
  });

  it("returns null for unavailable", () => {
    const lyrics: LyricsLookupResult = { ok: true, data: { status: "unavailable" } };
    expect(extractSourceLines(lyrics)).toBeNull();
  });

  it("returns null for a lyric lookup failure", () => {
    const lyrics: LyricsLookupResult = { ok: false, reason: "lookup_failed" };
    expect(extractSourceLines(lyrics)).toBeNull();
  });

  it("returns null when every extracted line is blank", () => {
    const lyrics: LyricsLookupResult = {
      ok: true,
      data: {
        status: "synced",
        plainText: "",
        lines: [
          { startTimeMs: 0, text: "" },
          { startTimeMs: 1000, text: "" },
        ],
      },
    };

    expect(extractSourceLines(lyrics)).toBeNull();
  });

  it("returns null when plain lyrics are entirely blank/whitespace", () => {
    const lyrics: LyricsLookupResult = { ok: true, data: { status: "plain", text: "   \n   " } };
    expect(extractSourceLines(lyrics)).toBeNull();
  });
});
