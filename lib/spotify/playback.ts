import { spotifyFetch, type SpotifyRequestResult } from "./client";

export type SpotifyTrack = {
  id: string;
  name: string;
  artistNames: string[];
  albumName: string | null;
  albumImageUrl: string | null;
  durationMs: number;
};

export type CurrentPlayback =
  | { status: "playing"; track: SpotifyTrack; progressMs: number }
  | { status: "paused"; track: SpotifyTrack; progressMs: number }
  | { status: "idle" }
  | { status: "non_track" }
  | { status: "unavailable" };

type SpotifyArtistItem = {
  name?: string;
};

type SpotifyAlbumItem = {
  name?: string;
  images?: { url: string }[];
};

type SpotifyTrackItem = {
  id?: string;
  name?: string;
  duration_ms?: number;
  artists?: SpotifyArtistItem[];
  album?: SpotifyAlbumItem;
};

type SpotifyPlaybackStateResponse = {
  is_playing: boolean;
  progress_ms: number | null;
  currently_playing_type: string;
  item: SpotifyTrackItem | null;
};

// Only fields future lyrics/playback-sync work actually depends on are
// required. Album name/artwork are display-only and degrade to null instead
// of making an otherwise-usable track "unavailable".
function normalizeTrack(item: SpotifyTrackItem): SpotifyTrack | null {
  const artistNames = (item.artists ?? [])
    .map((artist) => artist.name)
    .filter((name): name is string => Boolean(name));

  if (!item.id || !item.name || typeof item.duration_ms !== "number" || artistNames.length === 0) {
    return null;
  }

  return {
    id: item.id,
    name: item.name,
    artistNames,
    albumName: item.album?.name ?? null,
    albumImageUrl: item.album?.images?.[0]?.url ?? null,
    durationMs: item.duration_ms,
  };
}

const NON_TRACK_PLAYING_TYPES = new Set(["episode", "ad", "unknown"]);

export async function getCurrentPlayback(): Promise<SpotifyRequestResult<CurrentPlayback>> {
  // Spotify only populates `item` for the default "track" type unless the
  // client opts in via additional_types — without it, a playing podcast
  // episode comes back with currently_playing_type: "episode" but item:
  // null, which would otherwise be misread as "nothing playing".
  const result = await spotifyFetch<SpotifyPlaybackStateResponse>("/me/player?additional_types=episode");
  if (!result.ok) {
    return result;
  }

  if (!result.data) {
    return { ok: true, data: { status: "idle" } };
  }

  // Ads and "unknown" never have a representable item (regardless of
  // additional_types), so this must be checked before the item-null check
  // below — otherwise Spotify-identified non-track content would be
  // misread as idle instead of non_track.
  if (NON_TRACK_PLAYING_TYPES.has(result.data.currently_playing_type)) {
    return { ok: true, data: { status: "non_track" } };
  }

  if (!result.data.item) {
    return { ok: true, data: { status: "idle" } };
  }

  const track = normalizeTrack(result.data.item);
  if (!track) {
    return { ok: true, data: { status: "unavailable" } };
  }

  const progressMs = result.data.progress_ms ?? 0;
  return {
    ok: true,
    data: result.data.is_playing
      ? { status: "playing", track, progressMs }
      : { status: "paused", track, progressMs },
  };
}
