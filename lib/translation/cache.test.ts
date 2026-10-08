import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockParse, storeBox } = vi.hoisted(() => ({
  mockParse: vi.fn(),
  storeBox: {
    current: null as {
      read: (identity: TranslationCacheIdentity) => Promise<TranslationCacheRow | null>;
      upsert: (identity: TranslationCacheIdentity, payload: TranslationCachePayload) => Promise<void>;
    } | null,
  },
}));

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(function MockOpenAI() {
    return { responses: { parse: mockParse } };
  }),
}));

vi.mock("./cache", async () => {
  const actual = await vi.importActual<typeof import("./cache")>("./cache");
  return {
    ...actual,
    getTranslationCacheStore: () => storeBox.current,
  };
});

import type { TranslationCacheIdentity, TranslationCachePayload, TranslationCacheRow } from "./cache";
import { translateLyrics, type TranslateLyricsInput } from "./openai";
import { TRANSLATION_CACHE_VERSION, fingerprintSourceLines, fingerprintTranslationContext } from "./fingerprint";

type MemoryStore = NonNullable<(typeof storeBox)["current"]>;

const baseInput: TranslateLyricsInput = {
  sourceLines: ["Hola", "", "Adios"],
  targetLanguageCode: "en",
  trackName: "Song Title",
  artistName: "Primary Artist",
};

const alignedLines = [
  { sourceIndex: 0, translatedText: "Hello" },
  { sourceIndex: 1, translatedText: "" },
  { sourceIndex: 2, translatedText: "Goodbye" },
];

function completedResponse(outputParsed: unknown) {
  return {
    status: "completed",
    output: [{ type: "message", content: [{ type: "output_text", text: "" }] }],
    output_parsed: outputParsed,
  };
}

function validParsed() {
  return { sourceLanguage: "es", lines: alignedLines };
}

function identityFor(input: TranslateLyricsInput, model = "gpt-5.6-luna"): TranslationCacheIdentity {
  return {
    sourceFingerprint: fingerprintSourceLines(input.sourceLines),
    contextFingerprint: fingerprintTranslationContext(input.trackName.trim(), input.artistName.trim()),
    targetLanguage: input.targetLanguageCode,
    model,
    cacheVersion: TRANSLATION_CACHE_VERSION,
  };
}

function rowFor(identity: TranslationCacheIdentity, lines: unknown = alignedLines): TranslationCacheRow {
  return {
    targetLanguage: identity.targetLanguage,
    sourceLanguage: "es",
    sourceLineCount: baseInput.sourceLines.length,
    lines,
  };
}

function createMemoryStore(): MemoryStore & { rows: Map<string, TranslationCacheRow> } {
  const rows = new Map<string, TranslationCacheRow>();
  const keyOf = (identity: TranslationCacheIdentity) =>
    JSON.stringify([
      identity.sourceFingerprint,
      identity.contextFingerprint,
      identity.targetLanguage,
      identity.model,
      identity.cacheVersion,
    ]);

  return {
    rows,
    async read(identity) {
      return rows.get(keyOf(identity)) ?? null;
    },
    async upsert(identity, payload: TranslationCachePayload) {
      rows.set(keyOf(identity), {
        targetLanguage: identity.targetLanguage,
        sourceLanguage: payload.sourceLanguage,
        sourceLineCount: payload.sourceLineCount,
        lines: payload.lines,
      });
    },
  };
}

beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_TRANSLATION_MODEL = "gpt-5.6-luna";
  delete process.env.DATABASE_URL;
  mockParse.mockReset();
  storeBox.current = createMemoryStore();
});

describe("translation cache", () => {
  it("returns a valid hit without calling OpenAI", async () => {
    const store = createMemoryStore();
    const identity = identityFor(baseInput);
    store.rows.set(
      JSON.stringify([
        identity.sourceFingerprint,
        identity.contextFingerprint,
        identity.targetLanguage,
        identity.model,
        identity.cacheVersion,
      ]),
      rowFor(identity),
    );
    storeBox.current = store;

    const result = await translateLyrics({
      ...baseInput,
      trackName: "  Song Title  ",
      artistName: " Primary Artist ",
    });

    expect(mockParse).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      data: {
        sourceLanguage: "es",
        targetLanguage: "en",
        lines: alignedLines,
      },
    });
    if (result.ok) {
      expect(result.data.lines).toHaveLength(baseInput.sourceLines.length);
      result.data.lines.forEach((line, index) => {
        expect(line.sourceIndex).toBe(index);
      });
    }
  });

  it("preserves plain-lyric alignment on a cache hit", async () => {
    const input: TranslateLyricsInput = {
      ...baseInput,
      sourceLines: ["Uno", "Dos"],
    };
    const lines = [
      { sourceIndex: 0, translatedText: "One" },
      { sourceIndex: 1, translatedText: "Two" },
    ];
    const store = createMemoryStore();
    const identity = identityFor(input);
    await store.upsert(identity, {
      sourceLanguage: "es",
      sourceLineCount: 2,
      lines,
    });
    storeBox.current = store;

    const result = await translateLyrics(input);

    expect(mockParse).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.lines).toHaveLength(input.sourceLines.length);
      result.data.lines.forEach((line, index) => {
        expect(line.sourceIndex).toBe(index);
      });
    }
  });

  it("calls OpenAI on a miss and upserts the validated translation", async () => {
    mockParse.mockResolvedValue(completedResponse(validParsed()));
    const store = storeBox.current as ReturnType<typeof createMemoryStore>;

    const result = await translateLyrics(baseInput);

    expect(result.ok).toBe(true);
    expect(mockParse).toHaveBeenCalledTimes(1);
    const stored = await store.read(identityFor(baseInput));
    expect(stored).toEqual({
      targetLanguage: "en",
      sourceLanguage: "es",
      sourceLineCount: 3,
      lines: alignedLines,
    });
  });

  it("misses when the target language differs", async () => {
    const store = storeBox.current as ReturnType<typeof createMemoryStore>;
    const other = identityFor({ ...baseInput, targetLanguageCode: "fr" });
    await store.upsert(other, { sourceLanguage: "es", sourceLineCount: 3, lines: alignedLines });
    mockParse.mockResolvedValue(completedResponse(validParsed()));

    await translateLyrics(baseInput);

    expect(mockParse).toHaveBeenCalledTimes(1);
  });

  it("misses when the model differs", async () => {
    const store = storeBox.current as ReturnType<typeof createMemoryStore>;
    await store.upsert(identityFor(baseInput, "other-model"), {
      sourceLanguage: "es",
      sourceLineCount: 3,
      lines: alignedLines,
    });
    mockParse.mockResolvedValue(completedResponse(validParsed()));

    await translateLyrics(baseInput);

    expect(mockParse).toHaveBeenCalledTimes(1);
  });

  it("misses when the cache version differs", async () => {
    const store = storeBox.current as ReturnType<typeof createMemoryStore>;
    const identity = identityFor(baseInput);
    await store.upsert({ ...identity, cacheVersion: "v0" }, {
      sourceLanguage: "es",
      sourceLineCount: 3,
      lines: alignedLines,
    });
    mockParse.mockResolvedValue(completedResponse(validParsed()));

    await translateLyrics(baseInput);

    expect(mockParse).toHaveBeenCalledTimes(1);
    expect(await store.read(identity)).toEqual({
      targetLanguage: "en",
      sourceLanguage: "es",
      sourceLineCount: 3,
      lines: alignedLines,
    });
  });

  it("misses when the source fingerprint differs", async () => {
    const store = storeBox.current as ReturnType<typeof createMemoryStore>;
    const identity = identityFor(baseInput);
    await store.upsert(
      { ...identity, sourceFingerprint: "a".repeat(64) },
      { sourceLanguage: "es", sourceLineCount: 3, lines: alignedLines },
    );
    mockParse.mockResolvedValue(completedResponse(validParsed()));

    await translateLyrics(baseInput);

    expect(mockParse).toHaveBeenCalledTimes(1);
  });

  it("misses when the context fingerprint differs", async () => {
    const store = storeBox.current as ReturnType<typeof createMemoryStore>;
    const identity = identityFor(baseInput);
    await store.upsert(
      { ...identity, contextFingerprint: "b".repeat(64) },
      { sourceLanguage: "es", sourceLineCount: 3, lines: alignedLines },
    );
    mockParse.mockResolvedValue(completedResponse(validParsed()));

    await translateLyrics(baseInput);

    expect(mockParse).toHaveBeenCalledTimes(1);
  });

  it("falls back to OpenAI when the cache read fails", async () => {
    storeBox.current = {
      async read() {
        throw Object.assign(new Error("database unavailable"), { code: "ECONNREFUSED" });
      },
      async upsert() {},
    };
    mockParse.mockResolvedValue(completedResponse(validParsed()));

    const result = await translateLyrics(baseInput);

    expect(result.ok).toBe(true);
    expect(mockParse).toHaveBeenCalledTimes(1);
  });

  it("falls back to OpenAI when the cache connection times out", async () => {
    storeBox.current = {
      async read() {
        throw Object.assign(new Error("connect timeout"), { code: "CONNECT_TIMEOUT" });
      },
      async upsert() {
        throw Object.assign(new Error("connect timeout"), { code: "CONNECT_TIMEOUT" });
      },
    };
    mockParse.mockResolvedValue(completedResponse(validParsed()));

    const result = await translateLyrics(baseInput);

    expect(result).toEqual({
      ok: true,
      data: {
        sourceLanguage: "es",
        targetLanguage: "en",
        lines: alignedLines,
      },
    });
    expect(mockParse).toHaveBeenCalledTimes(1);
  });

  it("returns a successful translation when the cache write fails", async () => {
    storeBox.current = {
      async read() {
        return null;
      },
      async upsert() {
        throw Object.assign(new Error("write failed"), { code: "57014" });
      },
    };
    mockParse.mockResolvedValue(completedResponse(validParsed()));

    const result = await translateLyrics(baseInput);

    expect(result.ok).toBe(true);
    expect(mockParse).toHaveBeenCalledTimes(1);
  });

  it("does not cache a refused translation", async () => {
    const store = storeBox.current as ReturnType<typeof createMemoryStore>;
    mockParse.mockResolvedValue({
      status: "completed",
      output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }],
      output_parsed: null,
    });

    const result = await translateLyrics(baseInput);

    expect(result).toEqual({ ok: false, reason: "refused" });
    expect(store.rows.size).toBe(0);
  });

  it("does not cache an invalid translation", async () => {
    const store = storeBox.current as ReturnType<typeof createMemoryStore>;
    mockParse.mockResolvedValue(completedResponse({ sourceLanguage: "es", lines: [] }));

    const result = await translateLyrics(baseInput);

    expect(result).toEqual({ ok: false, reason: "invalid_response" });
    expect(store.rows.size).toBe(0);
  });

  it("does not cache a failed translation or replace a malformed row with it", async () => {
    const store = storeBox.current as ReturnType<typeof createMemoryStore>;
    const identity = identityFor(baseInput);
    const malformed = rowFor(identity, [{ sourceIndex: 4, translatedText: "nope" }]);
    await store.upsert(identity, {
      sourceLanguage: "es",
      sourceLineCount: 3,
      lines: malformed.lines as TranslationCachePayload["lines"],
    });
    mockParse.mockRejectedValue(new Error("network down"));

    const result = await translateLyrics(baseInput);

    expect(result).toEqual({ ok: false, reason: "request_failed" });
    expect(await store.read(identity)).toEqual(malformed);
  });

  it("repairs a malformed row and then serves the repaired translation from cache", async () => {
    const store = storeBox.current as ReturnType<typeof createMemoryStore>;
    const identity = identityFor(baseInput);
    await store.upsert(identity, {
      sourceLanguage: "es",
      sourceLineCount: 3,
      lines: [{ sourceIndex: 4, translatedText: "nope" }],
    });
    mockParse.mockResolvedValue(completedResponse(validParsed()));

    const first = await translateLyrics(baseInput);
    expect(first.ok).toBe(true);
    expect(mockParse).toHaveBeenCalledTimes(1);
    expect((await store.read(identity))?.lines).toEqual(alignedLines);

    mockParse.mockClear();
    const second = await translateLyrics(baseInput);

    expect(mockParse).not.toHaveBeenCalled();
    expect(second).toEqual(first);
  });

  it("lets a later validated upsert replace an earlier one without failing the request", async () => {
    const store = createMemoryStore();
    const identity = identityFor(baseInput);
    const firstLines = alignedLines;
    const secondLines = [
      { sourceIndex: 0, translatedText: "Hi" },
      { sourceIndex: 1, translatedText: "" },
      { sourceIndex: 2, translatedText: "Bye" },
    ];

    await expect(
      store.upsert(identity, { sourceLanguage: "es", sourceLineCount: 3, lines: firstLines }),
    ).resolves.toBeUndefined();
    await expect(
      store.upsert(identity, { sourceLanguage: "es", sourceLineCount: 3, lines: secondLines }),
    ).resolves.toBeUndefined();

    expect((await store.read(identity))?.lines).toEqual(secondLines);
  });
});
