import { z } from "zod";

export const TranslatedLineSchema = z.object({
  sourceIndex: z.number().int(),
  translatedText: z.string(),
});

// Structured Outputs' strict mode supports the `pattern` string constraint
// and enforces it during generation, not just after the fact — the model
// cannot emit a value that doesn't match. This only enforces *format*
// (two lowercase letters); it never verifies the model's classification is
// semantically correct. Translation success must never depend on that.
export const LyricsTranslationSchema = z.object({
  sourceLanguage: z.string().regex(/^[a-z]{2}$/),
  lines: z.array(TranslatedLineSchema),
});

export type LyricsTranslationPayload = z.infer<typeof LyricsTranslationSchema>;
