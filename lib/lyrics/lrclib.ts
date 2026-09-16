import packageJson from "../../package.json";
import type { SpotifyTrack } from "../spotify/playback";
import { parseSyncedLyrics, stripInlineLrcTranslation } from "./syncedLyrics";
import type { LyricsLookupResult, LyricsResult } from "./types";

const LRCLIB_BASE_URL = "https://lrclib.net/api";

// LRCLIB requires a User-Agent identifying the client's name, version, and a
// homepage/project page or email address. Sourced from package.json so
// there is a single place that defines both values.
const USER_AGENT = `Verso/${packageJson.version} (${packageJson.homepage})`;

// Deliberately reads only plainLyrics/syncedLyrics, not the newer
// `lyricsfile` field — nothing in the current roadmap needs the richer
// Lyricsfile format, and consuming it would add a YAML dependency for no
// current benefit.
type LrclibGetResponse = {
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
};

function buildLookupQuery(track: SpotifyTrack): string {
  const params = new URLSearchParams();
  // Deliberately unmodified: passing Spotify's exact title/primary-artist
  // is safer against cross-version false matches than trying to strip
  // "(feat. ...)"/"- Remastered"/"(Live)" suffixes ourselves. LRCLIB's own
  // artist + duration (+/-2s) matching is the anti-false-match mechanism.
  params.set("track_name", track.name.trim());
  params.set("artist_name", track.artistNames[0].trim());
  if (track.albumName) {
    params.set("album_name", track.albumName);
  }
  params.set("duration", String(Math.round(track.durationMs / 1000)));
  return params.toString();
}

function normalizeLrclibResponse(data: LrclibGetResponse): LyricsResult {
  if (data.instrumental) {
    return { status: "instrumental" };
  }

  const plainLyrics = (data.plainLyrics?.trim() ?? "")
    .split("\n")
    .map((line) => stripInlineLrcTranslation(line))
    .join("\n");
  const syncedLines = data.syncedLyrics ? parseSyncedLyrics(data.syncedLyrics) : [];

  if (syncedLines.length > 0) {
    // A valid synced match must never be discarded just because LRCLIB's
    // plainLyrics is empty/null — derive usable source text from the
    // parsed lines instead so Phase 4 translation always has something.
    const plainText =
      plainLyrics.length > 0
        ? plainLyrics
        : syncedLines
            .map((line) => line.text)
            .filter((text) => text.length > 0)
            .join("\n");
    return { status: "synced", lines: syncedLines, plainText };
  }

  if (plainLyrics.length > 0) {
    return { status: "plain", text: plainLyrics };
  }

  return { status: "unavailable" };
}

export async function getLyricsForTrack(track: SpotifyTrack): Promise<LyricsLookupResult> {
  let response: Response;
  try {
    response = await fetch(`${LRCLIB_BASE_URL}/get?${buildLookupQuery(track)}`, {
      headers: { "User-Agent": USER_AGENT },
    });
  } catch {
    return { ok: false, reason: "lookup_failed" };
  }

  if (response.status === 404) {
    return { ok: true, data: { status: "not_found" } };
  }

  // Covers non-404 error statuses (5xx, 429, etc.). LRCLIB requires 429's
  // Retry-After to be honored if hit, but Phase 3's single lookup-per-render
  // does not implement an automatic retry/backoff loop.
  if (!response.ok) {
    return { ok: false, reason: "lookup_failed" };
  }

  try {
    const data = (await response.json()) as LrclibGetResponse;
    return { ok: true, data: normalizeLrclibResponse(data) };
  } catch {
    return { ok: false, reason: "lookup_failed" };
  }
}
