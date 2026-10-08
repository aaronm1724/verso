import type { LyricsLookupResult } from "../lyrics/types";

// Returns null when there is nothing safe to send to the translator.
export function extractSourceLines(lyrics: LyricsLookupResult): string[] | null {
  if (!lyrics.ok) {
    return null;
  }

  const { data } = lyrics;

  let lines: string[];
  if (data.status === "synced") {
    // Blank entries are preserved in position — they carry timestamps
    // (end-of-song/gap markers) that playback-aligned display must not drift.
    lines = data.lines.map((line) => line.text);
  } else if (data.status === "plain") {
    lines = data.text.split("\n");
  } else {
    return null;
  }

  const hasTranslatableContent = lines.some((line) => line.trim().length > 0);
  return hasTranslatableContent ? lines : null;
}
