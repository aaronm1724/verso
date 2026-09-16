import type { SyncedLyricLine } from "./types";

// Standard LRC: "[mm:ss.xx]text" or "[mm:ss.xxx]text", one line per "\n".
// Non-timestamp lines (e.g. metadata tags like "[au: instrumental]") are
// silently skipped rather than treated as errors.
const TIMESTAMP_LINE = /^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)$/;

// Non-standard LRC used by Traly / Huawei's music player: the sung line and
// an inline translation share one timestamp as "original^translation".
// LRCLIB stores contributor text as-is. Only strip when both sides are
// non-empty so a lone "^" in lyric text is left alone.
export function stripInlineLrcTranslation(text: string): string {
  const separator = text.indexOf("^");
  if (separator <= 0) {
    return text;
  }
  const original = text.slice(0, separator).trimEnd();
  const suffix = text.slice(separator + 1).trim();
  if (original.length === 0 || suffix.length === 0) {
    return text;
  }
  return original;
}

export function parseSyncedLyrics(raw: string): SyncedLyricLine[] {
  const lines: SyncedLyricLine[] = [];

  for (const rawLine of raw.split("\n")) {
    const match = TIMESTAMP_LINE.exec(rawLine.trim());
    if (!match) {
      continue;
    }

    const [, minutes, seconds, fraction, text] = match;
    const fractionMs = fraction.length === 2 ? Number(fraction) * 10 : Number(fraction);
    const startTimeMs = Number(minutes) * 60_000 + Number(seconds) * 1_000 + fractionMs;

    // Trailing timestamp-only lines (empty text after trimming) are a
    // deliberate end-of-song/gap marker in LRCLIB's format, not noise.
    lines.push({ startTimeMs, text: stripInlineLrcTranslation(text.trim()) });
  }

  return lines;
}
