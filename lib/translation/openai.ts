import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import { isSupportedLanguageCode } from "./languages";
import { LyricsTranslationSchema, type LyricsTranslationPayload } from "./schema";
import type { TranslatedLyricLine, TranslationLookupResult } from "./types";

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

// Development-only diagnostics. Never enabled in production, and never
// given lyric text, prompts, translations, secrets, or raw responses — only
// which failure branch was hit and small, non-sensitive shape/metadata
// about why. The user-facing result stays a single generic message
// regardless of what's logged here. console.log, not console.error: every
// branch here is an expected, categorized outcome represented by
// TranslationLookupResult, not an application error, and Next.js dev
// tooling surfaces server-side console.error output to the browser as a
// red error overlay.
function devLog(event: string, details?: Record<string, unknown>): void {
  if (!isDev) {
    return;
  }
  console.log(`[translateLyrics] ${event}`, details ?? "");
}

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

// The model is asked to echo sourceIndex, but that instruction alone is not
// what guarantees correctness — this independent check is. Any length or
// index mismatch is treated as invalid_response rather than trusting the
// model's self-reported index.
function validateAlignment(
  sourceLineCount: number,
  payload: LyricsTranslationPayload,
): TranslatedLyricLine[] | null {
  if (payload.lines.length !== sourceLineCount) {
    return null;
  }

  for (let index = 0; index < payload.lines.length; index += 1) {
    if (payload.lines[index].sourceIndex !== index) {
      return null;
    }
  }

  return payload.lines.map((line) => ({
    sourceIndex: line.sourceIndex,
    translatedText: line.translatedText,
  }));
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

  // Constructed lazily, only after env validation. new OpenAI() throws
  // synchronously if apiKey is missing/empty — constructing this at module
  // scope would risk crashing the whole page render on a missing key
  // instead of degrading just this feature.
  const client = new OpenAI({ apiKey });

  let response;
  try {
    response = await client.responses.parse({
      model,
      input: [{ role: "system", content: buildPrompt(input) }],
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

  return {
    ok: true,
    data: {
      sourceLanguage: parsed.sourceLanguage,
      targetLanguage: input.targetLanguageCode,
      lines: alignedLines,
    },
  };
}
