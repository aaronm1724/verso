import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import { createDevLogger } from "../dev";
import { validateAlignment } from "./alignment";
import { getTranslationCacheStore, loadCachedTranslation, saveCachedTranslation } from "./cache";
import { TRANSLATION_CACHE_VERSION, fingerprintSourceLines, fingerprintTranslationContext } from "./fingerprint";
import { isSupportedLanguageCode } from "./languages";
import { LyricsTranslationSchema } from "./schema";
import type { TranslationLookupResult } from "./types";

// Confirmed against current OpenAI guidance: GPT-5.6 rejects "minimal" for
// reasoning.effort outright (400). "none" is the lowest supported rung and
// fully disables reasoning, which is appropriate for a bounded,
// schema-constrained line-translation task. Recommended env value:
// OPENAI_TRANSLATION_MODEL=gpt-5.6-luna (never hardcoded here).
const REASONING_EFFORT = "none" as const;
const TEXT_VERBOSITY = "low" as const;
// Sized for a full song (60-100+ lines) with headroom; reasoning:none means
// none of this budget is spent on invisible reasoning tokens.
const MAX_OUTPUT_TOKENS = 6000;

export type TranslateLyricsInput = {
  sourceLines: string[];
  targetLanguageCode: string;
  trackName: string;
  artistName: string;
};

function readRequiredEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.length > 0 ? value : null;
}

const isDev = process.env.NODE_ENV === "development";

// Expected translation outcomes. devLog, not devError: these are typed
// results, and devError surfaces as an application-error overlay.
const { devLog } = createDevLogger("translateLyrics");

function describeThrownError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const apiError = error as Error & {
      status?: number;
      code?: string | null;
      type?: string;
      requestID?: string | null;
    };
    return {
      name: apiError.name,
      message: apiError.message,
      status: apiError.status,
      code: apiError.code,
      type: apiError.type,
      requestID: apiError.requestID,
    };
  }
  return { name: "UnknownThrownValue", value: String(error) };
}

function buildPrompt(input: TranslateLyricsInput): string {
  const numberedLines = input.sourceLines
    .map((text, index) => `${index}: ${JSON.stringify(text)}`)
    .join("\n");

  return `You are translating song lyrics for "${input.trackName}" by ${input.artistName} into the language with ISO 639-1 code "${input.targetLanguageCode}".

Rules:
- Translate only the supplied lyric text below. Never invent, add, remove, reorder, or omit lines.
- Return exactly one entry in "lines" per numbered source line below, in the same order, with the same "sourceIndex".
- If a source line's text is blank, return "translatedText": "" for it — never invent content for a blank line.
- Preserve meaning and tone naturally. Translate slang and idiom the way a fluent speaker would actually say it, not a robotic word-for-word rendering.
- Never add commentary, explanations, notes, or any content beyond the translated lines themselves.
- Report your best-effort two-letter lowercase ISO 639-1 code for the detected source language as "sourceLanguage".

Numbered source lines (index: text):
${numberedLines}`;
}

export async function translateLyrics(input: TranslateLyricsInput): Promise<TranslationLookupResult> {
  // Defense in depth only — callers resolve the language code through
  // resolveTargetLanguageCode() before this is ever reached.
  if (!isSupportedLanguageCode(input.targetLanguageCode)) {
    return { ok: false, reason: "invalid_response" };
  }

  const apiKey = readRequiredEnv("OPENAI_API_KEY");
  const model = readRequiredEnv("OPENAI_TRANSLATION_MODEL");
  if (!apiKey || !model) {
    devLog("config_error", {
      hasApiKey: Boolean(apiKey),
      hasModel: Boolean(model),
      model,
    });
    return { ok: false, reason: "config_error" };
  }

  const title = input.trackName.trim();
  const artist = input.artistName.trim();
  const promptInput: TranslateLyricsInput = {
    ...input,
    trackName: title,
    artistName: artist,
  };
  const identity = {
    sourceFingerprint: fingerprintSourceLines(input.sourceLines),
    contextFingerprint: fingerprintTranslationContext(title, artist),
    targetLanguage: input.targetLanguageCode,
    model,
    cacheVersion: TRANSLATION_CACHE_VERSION,
  };
  const store = getTranslationCacheStore();
  const cached = await loadCachedTranslation(store, {
    identity,
    sourceLines: input.sourceLines,
  });
  if (cached.status === "hit") {
    return { ok: true, data: cached.result };
  }

  // Constructed lazily, only after env validation and a cache miss. new OpenAI()
  // throws synchronously if apiKey is missing/empty — constructing this at module
  // scope would risk crashing the whole page render on a missing key
  // instead of degrading just this feature.
  const client = new OpenAI({ apiKey });

  let response;
  try {
    response = await client.responses.parse({
      model,
      input: [{ role: "system", content: buildPrompt(promptInput) }],
      reasoning: { effort: REASONING_EFFORT },
      text: {
        format: zodTextFormat(LyricsTranslationSchema, "lyrics_translation"),
        verbosity: TEXT_VERBOSITY,
      },
      max_output_tokens: MAX_OUTPUT_TOKENS,
    });
  } catch (error) {
    devLog("request_failed (thrown)", describeThrownError(error));
    return { ok: false, reason: "request_failed" };
  }

  // Checked before inspecting output content: an incomplete response can
  // contain only reasoning items with no message/output_text at all.
  if (response.status === "incomplete") {
    devLog("request_failed (incomplete)", {
      status: response.status,
      incompleteReason: response.incomplete_details?.reason,
    });
    return { ok: false, reason: "request_failed" };
  }

  const message = response.output.find((item) => item.type === "message");
  const messageContent = message?.content[0];

  if (messageContent?.type === "refusal") {
    devLog("refused");
    return { ok: false, reason: "refused" };
  }

  const parsed = response.output_parsed;
  if (!parsed) {
    devLog("invalid_response (no output_parsed)", { status: response.status });
    return { ok: false, reason: "invalid_response" };
  }

  const alignedLines = validateAlignment(input.sourceLines.length, parsed);
  if (!alignedLines) {
    if (isDev) {
      const firstMismatchIndex = parsed.lines.findIndex((line, index) => line.sourceIndex !== index);
      devLog("invalid_response (alignment)", {
        expectedLineCount: input.sourceLines.length,
        actualLineCount: parsed.lines.length,
        firstMismatchingIndex: firstMismatchIndex === -1 ? null : firstMismatchIndex,
      });
    }
    return { ok: false, reason: "invalid_response" };
  }

  await saveCachedTranslation(store, {
    identity,
    payload: {
      sourceLanguage: parsed.sourceLanguage,
      sourceLineCount: input.sourceLines.length,
      lines: alignedLines,
    },
    repair: cached.status === "miss" && cached.malformed,
  });

  return {
    ok: true,
    data: {
      sourceLanguage: parsed.sourceLanguage,
      targetLanguage: input.targetLanguageCode,
      lines: alignedLines,
    },
  };
}
