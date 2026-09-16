import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { LyricsLookupResult } from "@/lib/lyrics/types";
import type { TranslationResult } from "@/lib/translation/types";

import { Lyrics, TranslatedLines, TranslationPending, TranslationUnavailable, zipDisplayLyricLines } from "./LyricsDisplay";

const syncedLyrics: LyricsLookupResult = {
  ok: true,
  data: {
    status: "synced",
    lines: [
      { startTimeMs: 0, text: "Hola mundo" },
      { startTimeMs: 1000, text: "" },
      { startTimeMs: 2000, text: "Adios" },
    ],
    plainText: "Hola mundo\n\nAdios",
  },
};

const plainLyrics: LyricsLookupResult = {
  ok: true,
  data: {
    status: "plain",
    text: "Hola mundo\n\nAdios",
  },
};

const failedLookup: LyricsLookupResult = {
  ok: false,
  reason: "lookup_failed",
};

describe("Lyrics", () => {
  it("renders each non-blank original line exactly once for synced lyrics", () => {
    const html = renderToStaticMarkup(<Lyrics lyrics={syncedLyrics} />);

    expect(html).toContain("Hola mundo");
    expect(html).toContain("Adios");
    expect(html.match(/Hola mundo/g)).toHaveLength(1);
  });

  it("renders plain lyric text for a successful plain LyricsLookupResult", () => {
    const html = renderToStaticMarkup(<Lyrics lyrics={plainLyrics} />);

    expect(html).toContain("Hola mundo");
    expect(html).toContain("Adios");
  });

  it("renders the Phase 3 lyric failure state for a failed lookup, not a crash", () => {
    const html = renderToStaticMarkup(<Lyrics lyrics={failedLookup} />);

    expect(html).toContain("Couldn&#x27;t fetch lyrics right now.");
  });
});

describe("TranslatedLines", () => {
  const translation: TranslationResult = {
    sourceLanguage: "es",
    targetLanguage: "en",
    lines: [
      { sourceIndex: 0, translatedText: "Hello world" },
      { sourceIndex: 1, translatedText: "" },
      { sourceIndex: 2, translatedText: "Goodbye" },
    ],
  };
  const originalLines = ["Hola mundo", "", "Adios"];

  it("pairs each non-blank original line with its translation exactly once", () => {
    const html = renderToStaticMarkup(<TranslatedLines data={translation} originalLines={originalLines} />);

    expect(html.match(/Hola mundo/g)).toHaveLength(1);
    expect(html.match(/Adios/g)).toHaveLength(1);
    expect(html).toContain("Hello world");
    expect(html).toContain("Goodbye");
  });

  it("shows an 'Already in {language}' note only when source and target languages match", () => {
    const html = renderToStaticMarkup(
      <TranslatedLines data={{ ...translation, sourceLanguage: "en" }} originalLines={originalLines} />,
    );

    expect(html).toContain("Already in English");
  });
});

describe("zipDisplayLyricLines", () => {
  it("pairs synced timestamps with translated text by array position, including blanks", () => {
    expect(
      zipDisplayLyricLines(
        [
          { startTimeMs: 0, text: "Hola mundo" },
          { startTimeMs: 1000, text: "" },
          { startTimeMs: 2000, text: "Adios" },
        ],
        [
        { sourceIndex: 0, translatedText: "Hello world" },
        { sourceIndex: 1, translatedText: "" },
        { sourceIndex: 2, translatedText: "Goodbye" },
      ]),
    ).toEqual([
      { startTimeMs: 0, originalText: "Hola mundo", translatedText: "Hello world" },
      { startTimeMs: 1000, originalText: "", translatedText: "" },
      { startTimeMs: 2000, originalText: "Adios", translatedText: "Goodbye" },
    ]);
  });

  it("uses an empty translated string when a source line has no pair", () => {
    expect(
      zipDisplayLyricLines([{ startTimeMs: 0, text: "Solo" }], []),
    ).toEqual([{ startTimeMs: 0, originalText: "Solo", translatedText: "" }]);
  });
});

describe("TranslationUnavailable", () => {
  it("renders the original lyrics once plus a generic failure note", () => {
    const html = renderToStaticMarkup(<TranslationUnavailable lyrics={syncedLyrics} />);

    expect(html.match(/Hola mundo/g)).toHaveLength(1);
    expect(html.match(/Adios/g)).toHaveLength(1);
    expect(html).toContain("Couldn&#x27;t translate lyrics right now.");
  });
});

describe("TranslationPending", () => {
  it("renders an indeterminate 'Translating to {language}…' status before the original lyrics, no fake percentage", () => {
    const html = renderToStaticMarkup(
      <TranslationPending lyrics={syncedLyrics} targetLanguageCode="en" />,
    );

    expect(html.match(/Hola mundo/g)).toHaveLength(1);
    expect(html.match(/Adios/g)).toHaveLength(1);
    expect(html).toContain("Translating to English");
    expect(html).not.toMatch(/%/);

    // Below full-length lyrics, a status placed after the lyric block would
    // be scrolled out of view — it must render first in document order.
    const statusIndex = html.indexOf("Translating to English");
    const lyricsIndex = html.indexOf("Hola mundo");
    expect(statusIndex).toBeGreaterThan(-1);
    expect(lyricsIndex).toBeGreaterThan(-1);
    expect(statusIndex).toBeLessThan(lyricsIndex);
  });

  it("renders role=\"status\" on the pending indicator", () => {
    const html = renderToStaticMarkup(
      <TranslationPending lyrics={syncedLyrics} targetLanguageCode="en" />,
    );

    expect(html).toContain('role="status"');
  });
});
