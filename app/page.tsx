import { getCurrentUserProfile } from "@/lib/spotify/client";
import { getCurrentPlayback, type CurrentPlayback } from "@/lib/spotify/playback";

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function NowPlaying({ playback }: { playback: CurrentPlayback }) {
  if (playback.status === "idle") {
    return <p className="text-sm text-zinc-500">Nothing playing right now.</p>;
  }

  if (playback.status === "non_track" || playback.status === "unavailable") {
    return (
      <p className="text-sm text-zinc-500">
        Verso can&apos;t show lyrics for what&apos;s currently playing yet.
      </p>
    );
  }

  const { track, progressMs } = playback;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3">
      {track.albumImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- external Spotify-hosted artwork; not worth next/image remote-pattern config for one Phase 2 thumbnail
        <img
          src={track.albumImageUrl}
          alt=""
          className="h-12 w-12 rounded-lg object-cover"
        />
      ) : null}
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium text-zinc-100">{track.name}</span>
        <span className="truncate text-xs text-zinc-400">{track.artistNames.join(", ")}</span>
        <span className="text-xs text-zinc-500">
          {playback.status === "playing" ? "Playing" : "Paused"} ·{" "}
          {formatDuration(progressMs)} / {formatDuration(track.durationMs)}
        </span>
      </div>
    </div>
  );
}

const SPOTIFY_ERROR_MESSAGES: Record<string, string> = {
  denied: "Spotify authorization was cancelled. Connect again anytime.",
  state_mismatch:
    "That connection attempt expired or looked tampered with. Please try again.",
  callback_failed:
    "Spotify didn't send back the information Verso needed. Please try again.",
  token_exchange_failed:
    "Verso couldn't finish connecting to Spotify. Please try again.",
};

function resolveSpotifyErrorMessage(code: string | undefined): string | undefined {
  if (!code) {
    return undefined;
  }
  return (
    SPOTIFY_ERROR_MESSAGES[code] ??
    "Something went wrong connecting to Spotify. Please try again."
  );
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const rawError = params.spotify_error;
  const errorCode = typeof rawError === "string" ? rawError : undefined;
  const errorMessage = resolveSpotifyErrorMessage(errorCode);

  const profile = await getCurrentUserProfile();
  const playback = profile.ok ? await getCurrentPlayback() : null;

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-sm flex-col gap-10">
        <span className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">
          Verso
        </span>

        <div className="flex flex-col gap-4">
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-50">
            Understand the songs you love.
          </h1>
          <p className="text-base leading-relaxed text-zinc-400">
            Verso connects to Spotify, figures out what you&apos;re currently
            listening to, and shows you the lyrics — translated into your
            language of choice.
          </p>
        </div>

        <ol className="flex flex-col gap-3 text-sm text-zinc-400">
          <li className="flex gap-3">
            <span className="text-zinc-500">1</span>
            <span>Connect your Spotify account.</span>
          </li>
          <li className="flex gap-3">
            <span className="text-zinc-500">2</span>
            <span>Verso detects the song currently playing.</span>
          </li>
          <li className="flex gap-3">
            <span className="text-zinc-500">3</span>
            <span>Read the original lyrics alongside a translation.</span>
          </li>
        </ol>

        {errorMessage ? (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {errorMessage}
          </p>
        ) : null}

        {profile.ok ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 rounded-full border border-zinc-800 bg-zinc-900 px-4 py-2">
              {profile.data.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- external Spotify-hosted avatar; not worth next/image remote-pattern config for one optional Phase 1 thumbnail
                <img
                  src={profile.data.imageUrl}
                  alt=""
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : null}
              <span className="text-sm text-zinc-200">
                Connected as {profile.data.displayName ?? "your Spotify account"}
              </span>
            </div>
            {playback ? (
              playback.ok ? (
                <NowPlaying playback={playback.data} />
              ) : (
                <p className="text-sm text-zinc-500">
                  Couldn&apos;t check what&apos;s playing right now.
                </p>
              )
            ) : null}
            <form action="/api/auth/spotify/logout" method="post">
              <button
                type="submit"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-zinc-700 px-5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-900"
              >
                Disconnect
              </button>
            </form>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <a
              href="/api/auth/spotify/login"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
            >
              Connect Spotify
            </a>
            {profile.reason === "spotify_request_failed" ? (
              <p className="text-center text-xs text-zinc-500">
                Verso couldn&apos;t reach Spotify just now. Try connecting again.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}
