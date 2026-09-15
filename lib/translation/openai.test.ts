import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockParse } = vi.hoisted(() => ({ mockParse: vi.fn() }));

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(function MockOpenAI() {
    return { responses: { parse: mockParse } };
  }),
}));

import { translateLyrics, type TranslateLyricsInput } from "./openai";

type CapturedRequest = {
  model: string;
  reasoning: { effort: string };
  text: { verbosity: string };
  max_output_tokens: number;
};

const baseInput: TranslateLyricsInput = {
  sourceLines: ["Hola", "", "Adios"],
  targetLanguageCode: "en",
  trackName: "Song Title",
  artistName: "Primary Artist",
};

function completedResponse(outputParsed: unknown, contentType: "output_text" | "refusal" = "output_text") {
  return {
    status: "completed",
    output: [
      {
        type: "message",
        content: [
          contentType === "refusal"
            ? { type: "refusal", refusal: "I can't help with that." }
            : { type: "output_text", text: "" },
        ],
      },
    ],
    output_parsed: outputParsed,
  };
}

beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_TRANSLATION_MODEL = "gpt-5.6-luna";
  mockParse.mockReset();
});

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_TRANSLATION_MODEL;
});

describe("translateLyrics", () => {
  it("returns ok:true with correctly mapped lines for a valid aligned response", async () => {
    mockParse.mockResolvedValue(
      completedResponse({
        sourceLanguage: "es",
        lines: [
          { sourceIndex: 0, translatedText: "Hello" },
          { sourceIndex: 1, translatedText: "" },
          { sourceIndex: 2, translatedText: "Goodbye" },
        ],
      }),
    );

    const result = await translateLyrics(baseInput);

    expect(result).toEqual({
      ok: true,
      data: {
        sourceLanguage: "es",
        targetLanguage: "en",
        lines: [
          { sourceIndex: 0, translatedText: "Hello" },
          { sourceIndex: 1, translatedText: "" },
          { sourceIndex: 2, translatedText: "Goodbye" },
        ],
      },
    });
  });

  it("keeps a blank source line blank at the correct index with no drift", async () => {
    mockParse.mockResolvedValue(
      completedResponse({
        sourceLanguage: "es",
        lines: [
          { sourceIndex: 0, translatedText: "Hello" },
          { sourceIndex: 1, translatedText: "" },
          { sourceIndex: 2, translatedText: "Goodbye" },
        ],
      }),
    );

    const result = await translateLyrics(baseInput);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.lines[1]).toEqual({ sourceIndex: 1, translatedText: "" });
    }
  });

  it("returns invalid_response when the returned line count does not match", async () => {
    mockParse.mockResolvedValue(
      completedResponse({
        sourceLanguage: "es",
        lines: [{ sourceIndex: 0, translatedText: "Hello" }],
      }),
    );

    const result = await translateLyrics(baseInput);

    expect(result).toEqual({ ok: false, reason: "invalid_response" });
  });

  it("returns invalid_response when sourceIndex values are mismatched/out of order", async () => {
    mockParse.mockResolvedValue(
      completedResponse({
        sourceLanguage: "es",
        lines: [
          { sourceIndex: 1, translatedText: "Hello" },
          { sourceIndex: 0, translatedText: "" },
          { sourceIndex: 2, translatedText: "Goodbye" },
        ],
      }),
    );

    const result = await translateLyrics(baseInput);

    expect(result).toEqual({ ok: false, reason: "invalid_response" });
  });

  it("returns refused when the model returns a refusal", async () => {
    mockParse.mockResolvedValue(completedResponse(null, "refusal"));

    const result = await translateLyrics(baseInput);

    expect(result).toEqual({ ok: false, reason: "refused" });
  });

  it("returns request_failed for an incomplete/truncated response", async () => {
    mockParse.mockResolvedValue({
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      output: [],
      output_parsed: null,
    });

    const result = await translateLyrics(baseInput);

    expect(result).toEqual({ ok: false, reason: "request_failed" });
  });

  it("returns request_failed on a thrown API/network error", async () => {
    mockParse.mockRejectedValue(new Error("network down"));

    const result = await translateLyrics(baseInput);

    expect(result).toEqual({ ok: false, reason: "request_failed" });
  });

  it("returns invalid_response when output_parsed is missing/null", async () => {
    mockParse.mockResolvedValue(completedResponse(null));

    const result = await translateLyrics(baseInput);

    expect(result).toEqual({ ok: false, reason: "invalid_response" });
  });

  it("returns config_error and never calls the API when OPENAI_API_KEY is missing", async () => {
    delete process.env.OPENAI_API_KEY;

    const result = await translateLyrics(baseInput);

    expect(result).toEqual({ ok: false, reason: "config_error" });
    expect(mockParse).not.toHaveBeenCalled();
  });

  it("returns config_error and never calls the API when OPENAI_TRANSLATION_MODEL is missing", async () => {
    delete process.env.OPENAI_TRANSLATION_MODEL;

    const result = await translateLyrics(baseInput);

    expect(result).toEqual({ ok: false, reason: "config_error" });
    expect(mockParse).not.toHaveBeenCalled();
  });

  it("rejects an unsupported target language before calling the API", async () => {
    const result = await translateLyrics({ ...baseInput, targetLanguageCode: "xx" });

    expect(result.ok).toBe(false);
    expect(mockParse).not.toHaveBeenCalled();
  });

  it("builds the request with the env-configured model, minimal-latency config, and explicit token ceiling", async () => {
    mockParse.mockResolvedValue(
      completedResponse({
        sourceLanguage: "es",
        lines: [
          { sourceIndex: 0, translatedText: "Hi" },
          { sourceIndex: 1, translatedText: "" },
          { sourceIndex: 2, translatedText: "Bye" },
        ],
      }),
    );

    await translateLyrics(baseInput);

    expect(mockParse).toHaveBeenCalledTimes(1);
    const requestArg = mockParse.mock.calls[0][0] as CapturedRequest;
    expect(requestArg.model).toBe("gpt-5.6-luna");
    expect(requestArg.reasoning).toEqual({ effort: "none" });
    expect(requestArg.text.verbosity).toBe("low");
    expect(requestArg.max_output_tokens).toBe(6000);
  });
});
