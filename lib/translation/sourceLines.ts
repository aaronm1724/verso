import type { LyricsLookupResult } from "../lyrics/types";

// Pure gating + splitting helper: no OpenAI dependency, so "no OpenAI call
// for untranslatable lyrics" is unit-testable without mocking a client.
//
// Returns null (never send empty content to OpenAI) for:
// - a failed lookup
// - instrumental / not_found / unavailable lyrics
// - lyrics that extract to zero non-blank lines
export function extractSourceLines(lyrics: LyricsLookupResult): string[] | null {
  if (!lyrics.ok) {
    return null;
  }

  const { data } = lyrics;

  let lines: string[];
  if (data.status === "synced") {
    // Blank entries are preserved in position — they carry timestamps
    // (end-of-song/gap markers) that Phase 5 alignment must not drift.
    lines = data.lines.map((line) => line.text);
  } else if (data.status === "plain") {
    lines = data.text.split("\n");
  } else {
    return null;
  }

  const hasTranslatableContent = lines.some((line) => line.trim().length > 0);
  return hasTranslatableContent ? lines : null;
}
