import type { LyricsTranslationPayload } from "./schema";
import type { TranslatedLyricLine } from "./types";

// The model is asked to echo sourceIndex, but that instruction alone is not
// what guarantees correctness — this independent check is. Any length or
// index mismatch is rejected rather than trusting the reported index.
export function validateAlignment(
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
