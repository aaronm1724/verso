import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LyricsLookupResult } from "@/lib/lyrics/types";

const { translateLyrics } = vi.hoisted(() => ({ translateLyrics: vi.fn() }));
vi.mock("@/lib/translation/openai", () => ({ translateLyrics }));

// TranslationSection is a plain async function (a Server Component), so it
// can be awaited directly to get its resolved element tree without going
// through React's Suspense/streaming machinery — matching how Next.js
// itself resolves it before handing a synchronous tree to the renderer.
// Lyrics/TranslatedLines/TranslationPending/TranslationUnavailable render
// tests live in app/LyricsDisplay.test.tsx, next to that module.
import { TranslationSection } from "./page";

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

const baseSectionInput = {
  lyrics: syncedLyrics,
  sourceLines: ["Hola mundo", "", "Adios"],
  targetLanguageCode: "en",
  trackName: "Test Track",
  artistName: "Test Artist",
  trackId: "track-1",
  durationMs: 180_000,
};

beforeEach(() => {
  translateLyrics.mockReset();
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

  it("keeps plain lyrics on the static paired layout rather than the synced player", async () => {
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

    const element = await TranslationSection({
      ...baseSectionInput,
      lyrics: {
        ok: true,
        data: { status: "plain", text: "Hola mundo\n\nAdios" },
      },
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Hello world");
    expect(html).toContain("Hola mundo");
    expect(html).not.toContain("Resume following");
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
