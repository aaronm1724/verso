export type TranslatedLyricLine = {
  sourceIndex: number;
  // "" is a valid, meaningful value here (blank source line), not noise.
  translatedText: string;
};

export type TranslationResult = {
  // ISO 639-1-shaped, lowercase two-letter code; best-effort model-reported
  // metadata, never verified for semantic correctness. Only used for
  // lightweight UX (e.g. an "Already in {language}" note).
  sourceLanguage: string;
  targetLanguage: string;
  lines: TranslatedLyricLine[];
};

export type TranslationLookupResult =
  | { ok: true; data: TranslationResult }
  | { ok: false; reason: "config_error" | "request_failed" | "invalid_response" | "refused" };
