import { describe, expect, it } from "vitest";

import { extractSourceLines } from "./sourceLines";
import { fingerprintSourceLines, fingerprintTranslationContext } from "./fingerprint";
import type { LyricsLookupResult } from "../lyrics/types";

function synced(lines: Array<{ startTimeMs: number; text: string }>): LyricsLookupResult {
  return {
    ok: true,
    data: {
      status: "synced",
      lines,
      plainText: lines.map((line) => line.text).join("\n"),
    },
  };
}

describe("fingerprintSourceLines", () => {
  const lines = ["Hola", "", "Adios"];

  it("is deterministic", () => {
    expect(fingerprintSourceLines(lines)).toBe(fingerprintSourceLines([...lines]));
  });

  it("changes when line text changes", () => {
    expect(fingerprintSourceLines(["Hola", "", "Adios"])).not.toBe(fingerprintSourceLines(["Hello", "", "Adios"]));
  });

  it("changes when line order changes", () => {
    expect(fingerprintSourceLines(["Hola", "", "Adios"])).not.toBe(fingerprintSourceLines(["Adios", "", "Hola"]));
  });

  it("changes when a blank line changes", () => {
    expect(fingerprintSourceLines(["Hola", "", "Adios"])).not.toBe(fingerprintSourceLines(["Hola", " ", "Adios"]));
  });

  it("ignores timestamps and lyric kind", () => {
    const early = extractSourceLines(
      synced([
        { startTimeMs: 0, text: "Hola" },
        { startTimeMs: 1000, text: "" },
        { startTimeMs: 2000, text: "Adios" },
      ]),
    );
    const later = extractSourceLines(
      synced([
        { startTimeMs: 500, text: "Hola" },
        { startTimeMs: 2500, text: "" },
        { startTimeMs: 4000, text: "Adios" },
      ]),
    );
    const plain = extractSourceLines({ ok: true, data: { status: "plain", text: "Hola\n\nAdios" } });

    expect(early).toEqual(["Hola", "", "Adios"]);
    expect(fingerprintSourceLines(early!)).toBe(fingerprintSourceLines(later!));
    expect(fingerprintSourceLines(early!)).toBe(fingerprintSourceLines(plain!));
  });
});

describe("fingerprintTranslationContext", () => {
  it("is deterministic", () => {
    expect(fingerprintTranslationContext("Song", "Artist")).toBe(fingerprintTranslationContext("Song", "Artist"));
  });

  it("treats trimmed whitespace as the same context", () => {
    expect(fingerprintTranslationContext("  Song  ".trim(), "\nArtist\n".trim())).toBe(
      fingerprintTranslationContext("Song", "Artist"),
    );
    expect(fingerprintTranslationContext(" Song", "Artist")).not.toBe(fingerprintTranslationContext("Song", "Artist"));
  });

  it("changes when the title changes", () => {
    expect(fingerprintTranslationContext("Song", "Artist")).not.toBe(fingerprintTranslationContext("Other", "Artist"));
  });

  it("changes when the artist changes", () => {
    expect(fingerprintTranslationContext("Song", "Artist")).not.toBe(fingerprintTranslationContext("Song", "Other"));
  });
});
