import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LyricsLookupResult } from "@/lib/lyrics/types";

const { translateLyrics } = vi.hoisted(() => ({ translateLyrics: vi.fn() }));
vi.mock("@/lib/translation/openai", () => ({ translateLyrics }));

// TranslationSection is a plain async function (a Server Component), so it
// can be awaited directly to get its resolved element tree without going
// through React's Suspense/streaming machinery — matching how Next.js
// itself resolves it before handing a synchronous tree to the renderer.
import { Lyrics, TranslationPending, TranslationSection } from "./page";

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

const baseSectionInput = {
  lyrics: syncedLyrics,
  sourceLines: ["Hola mundo", "", "Adios"],
  targetLanguageCode: "en",
  trackName: "Test Track",
  artistName: "Test Artist",
};

beforeEach(() => {
  translateLyrics.mockReset();
});

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

describe("TranslationSection", () => {
  it("renders paired original + translated lines exactly once on success, with no duplicate original lyric block", async () => {
    translateLyrics.mockResolvedValue({
      ok: true,
      data: {
        sourceLanguage: "es",
        targetLanguage: "en",
        lines: [
          { sourceIndex: 0, translatedText: "Hello world" },
          { sourceIndex: 1, translatedText: "" },
          { sourceIndex: 2, translatedText: "Goodbye" },
        ],
      },
    });

    const element = await TranslationSection(baseSectionInput);
    const html = renderToStaticMarkup(element);

    expect(html.match(/Hola mundo/g)).toHaveLength(1);
    expect(html.match(/Adios/g)).toHaveLength(1);
    expect(html).toContain("Hello world");
    expect(html).toContain("Goodbye");
  });

  it("falls back to the original lyrics plus a generic failure note on translation failure, without duplicating lines", async () => {
    translateLyrics.mockResolvedValue({ ok: false, reason: "request_failed" });

    const element = await TranslationSection(baseSectionInput);
    const html = renderToStaticMarkup(element);

    expect(html.match(/Hola mundo/g)).toHaveLength(1);
    expect(html.match(/Adios/g)).toHaveLength(1);
    expect(html).toContain("Couldn&#x27;t translate lyrics right now.");
  });

  it("falls back to the original lyrics plus a generic failure note if translateLyrics unexpectedly throws instead of resolving", async () => {
    translateLyrics.mockRejectedValue(new Error("unexpected"));

    const element = await TranslationSection(baseSectionInput);
    const html = renderToStaticMarkup(element);

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
