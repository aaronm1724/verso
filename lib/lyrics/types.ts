export type SyncedLyricLine = {
  startTimeMs: number;
  // "" is a valid, meaningful value here (end-of-song/gap marker), not noise.
  text: string;
};

export type LyricsResult =
  | { status: "synced"; lines: SyncedLyricLine[]; plainText: string }
  | { status: "plain"; text: string }
  | { status: "instrumental" }
  | { status: "not_found" }
  | { status: "unavailable" };

export type LyricsLookupResult =
  | { ok: true; data: LyricsResult }
  | { ok: false; reason: "lookup_failed" };
