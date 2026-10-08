export type SupportedLanguage = {
  code: string;
  label: string;
};

// Fixed list shared by the selector and validation. The choice is not saved.
export const SUPPORTED_TARGET_LANGUAGES: SupportedLanguage[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
];

export const DEFAULT_TARGET_LANGUAGE = "en";

const SUPPORTED_CODES = new Set(SUPPORTED_TARGET_LANGUAGES.map((language) => language.code));

export function isSupportedLanguageCode(code: string): boolean {
  return SUPPORTED_CODES.has(code);
}

export function resolveTargetLanguageCode(rawCode: string | undefined): string {
  if (rawCode && isSupportedLanguageCode(rawCode)) {
    return rawCode;
  }
  return DEFAULT_TARGET_LANGUAGE;
}

export function getLanguageLabel(code: string): string {
  return SUPPORTED_TARGET_LANGUAGES.find((language) => language.code === code)?.label ?? code;
}
