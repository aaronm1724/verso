import { describe, expect, it } from "vitest";

import { LyricsTranslationSchema } from "./schema";

describe("LyricsTranslationSchema", () => {
  it("accepts a well-formed payload with a valid two-letter lowercase sourceLanguage", () => {
    const result = LyricsTranslationSchema.safeParse({
      sourceLanguage: "es",
      lines: [
        { sourceIndex: 0, translatedText: "Hello" },
        { sourceIndex: 1, translatedText: "" },
      ],
    });

    expect(result.success).toBe(true);
  });

  it.each(["e", "eng", "ES", "e1", ""])("rejects a malformed sourceLanguage (%s)", (sourceLanguage) => {
    const result = LyricsTranslationSchema.safeParse({
      sourceLanguage,
      lines: [{ sourceIndex: 0, translatedText: "Hello" }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects a payload missing sourceIndex", () => {
    const result = LyricsTranslationSchema.safeParse({
      sourceLanguage: "es",
      lines: [{ translatedText: "Hello" }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects a payload missing translatedText", () => {
    const result = LyricsTranslationSchema.safeParse({
      sourceLanguage: "es",
      lines: [{ sourceIndex: 0 }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects a payload missing sourceLanguage entirely", () => {
    const result = LyricsTranslationSchema.safeParse({
      lines: [{ sourceIndex: 0, translatedText: "Hello" }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects wrong field types", () => {
    const result = LyricsTranslationSchema.safeParse({
      sourceLanguage: "es",
      lines: [{ sourceIndex: "0", translatedText: 123 }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects a non-array lines field", () => {
    const result = LyricsTranslationSchema.safeParse({
      sourceLanguage: "es",
      lines: "not an array",
    });

    expect(result.success).toBe(false);
  });
});
