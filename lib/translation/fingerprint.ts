import { createHash } from "node:crypto";

// Bump manually when translation behavior changes (prompt policy, alignment
// rules, schema semantics). Do not hash the prompt or source tree.
export const TRANSLATION_CACHE_VERSION = "v1";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// Text, order, and blank entries only. Timestamps stay out so a lyric-timing
// correction can reuse the translation while playback uses the new times.
export function fingerprintSourceLines(sourceLines: readonly string[]): string {
  return sha256(`v1:${JSON.stringify(sourceLines)}`);
}

// Title and artist are semantic prompt inputs, so they belong in the identity.
// Callers must pass the same trimmed strings the prompt receives.
export function fingerprintTranslationContext(title: string, artist: string): string {
  return sha256(`v1:${JSON.stringify({ title, artist })}`);
}
