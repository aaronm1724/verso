import { Suspense } from "react";

import { LanguageSelect } from "./LanguageSelect";
import { getCurrentUserProfile } from "@/lib/spotify/client";
import { getCurrentPlayback, type CurrentPlayback } from "@/lib/spotify/playback";
import { getLyricsForTrack } from "@/lib/lyrics/lrclib";
import type { LyricsLookupResult } from "@/lib/lyrics/types";
import {
  SUPPORTED_TARGET_LANGUAGES,
  getLanguageLabel,
  resolveTargetLanguageCode,
} from "@/lib/translation/languages";
import { extractSourceLines } from "@/lib/translation/sourceLines";
import { translateLyrics } from "@/lib/translation/openai";
import type { TranslationLookupResult, TranslationResult } from "@/lib/translation/types";

const isDev = process.env.NODE_ENV === "development";

// Development-only diagnostics for the lyric/translation gating path. Never
// enabled in production, and never given lyric/translation text — only
// status/discriminator values and counts needed to trace which branch a
// given request took. console.log, not console.error: Next.js dev tooling
// treats server-side console.error output as an application error and
// surfaces it to the browser as a red overlay, which is misleading for
// routine, expected-branch diagnostics like these.
function devLog(event: string, details?: Record<string, unknown>): void {
  if (!isDev) {
    return;
  }
  console.log(`[page] ${event}`, details ?? "");
}

// Reserved for genuinely unexpected failures only — i.e. something outside
// the TranslationLookupResult flow that translateLyrics() is supposed to
// always represent as a normal return value rather than a thrown error.
function devError(event: string, details?: Record<string, unknown>): void {
  if (!isDev) {
    return;
  }
  console.error(`[page] ${event}`, details ?? "");
}

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

const LYRICS_UNAVAILABLE_MESSAGE = "Lyrics not found for this track.";

export function Lyrics({ lyrics }: { lyrics: LyricsLookupResult }) {
  if (!lyrics.ok) {
    devLog("Lyrics: rendering lookup_failed branch", { reason: lyrics.reason });
    return <p className="text-sm text-zinc-500">Couldn&apos;t fetch lyrics right now.</p>;
  }

  const { data } = lyrics;

  if (data.status === "instrumental") {
    return <p className="text-sm text-zinc-500">This track is instrumental.</p>;
  }

  // not_found and unavailable share fallback copy for now; the distinction
  // exists in the domain model for future debugging, not the UI.
  if (data.status === "not_found" || data.status === "unavailable") {
    return <p className="text-sm text-zinc-500">{LYRICS_UNAVAILABLE_MESSAGE}</p>;
  }

  if (data.status === "synced") {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm leading-relaxed text-zinc-300">
        {data.lines
          .filter((line) => line.text.length > 0)
          .map((line) => (
            <p key={line.startTimeMs}>{line.text}</p>
          ))}
      </div>
    );
  }

  return (
    <div className="whitespace-pre-line rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm leading-relaxed text-zinc-300">
      {data.text}
    </div>
  );
}

const TRANSLATION_FAILURE_MESSAGE = "Couldn't translate lyrics right now.";

function TranslatedLines({
  data,
  originalLines,
}: {
  data: TranslationResult;
  originalLines: string[];
}) {
  const alreadyInTargetLanguage = data.sourceLanguage === data.targetLanguage;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm leading-relaxed">
      {alreadyInTargetLanguage ? (
        <p className="text-xs text-zinc-500">Already in {getLanguageLabel(data.targetLanguage)}.</p>
      ) : null}
      {data.lines
        .filter((line) => (originalLines[line.sourceIndex] ?? "").trim().length > 0)
        .map((line) => (
          <div key={line.sourceIndex} className="flex flex-col gap-0.5">
            <p className="text-zinc-300">{originalLines[line.sourceIndex]}</p>
            <p className="text-zinc-500">{line.translatedText}</p>
          </div>
        ))}
    </div>
  );
}

// Shared degraded state: original lyrics stay visible plus one generic
// note. Used both when translateLyrics() resolves to a failure and for the
// (never expected, but defended against below) case where something
// throws instead of resolving — the user sees the same thing either way.
function TranslationUnavailable({ lyrics }: { lyrics: LyricsLookupResult }) {
  return (
    <div className="flex flex-col gap-2">
      <Lyrics lyrics={lyrics} />
      <p className="text-sm text-zinc-500">{TRANSLATION_FAILURE_MESSAGE}</p>
    </div>
  );
}

// The Suspense fallback while translateLyrics() is in flight (typically a
// handful of seconds). The status row renders first — on a long song, a
// status placed after the full lyric block would be scrolled out of view
// and effectively invisible. Original lyrics still render in full right
// below it, never blocked or hidden while translation is pending.
export function TranslationPending({
  lyrics,
  targetLanguageCode,
}: {
  lyrics: LyricsLookupResult;
  targetLanguageCode: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div role="status" className="flex items-center gap-2 text-xs text-zinc-500">
        <span
          aria-hidden="true"
          className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400"
        />
        <span>Translating to {getLanguageLabel(targetLanguageCode)}…</span>
      </div>
      <Lyrics lyrics={lyrics} />
    </div>
  );
}

function describeUnexpectedError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack?.split("\n")[0] };
  }
  return { name: "UnknownThrownValue", value: String(error) };
}

// A separate async Server Component so it can be wrapped in <Suspense>:
// track info render immediately (Home, below), and this streams in once
// the OpenAI call resolves, instead of blocking the whole page render on
// translation. Its <Suspense> fallback shows the original lyrics plus a
// pending indicator, so this component owns the entire lyric region once
// it resolves — it must never render the original lines a second time
// alongside its own output, which is why it renders <TranslationUnavailable>
// (not paired lines a second time) on translation failure rather than a
// bare error message.
//
// translateLyrics() is designed to always resolve to a TranslationLookupResult
// (ok:true or a categorized ok:false) and never reject, so there is
// intentionally no Client Component error boundary wrapping this Suspense
// boundary — Next.js 16's Suspense/streaming machinery does not expect a
// hand-rolled class-based error boundary around a Server Component subtree,
// and adding one previously produced a spurious dev-only "the server could
// not finish this Suspense boundary" recoverable-error overlay with no
// underlying application error. The try/catch below exists purely as a
// narrow diagnostic net for a genuinely unexpected throw outside that
// flow — it does not add another fallback UI beyond the one already used
// for a normal translation failure.
export async function TranslationSection({
  lyrics,
  sourceLines,
  targetLanguageCode,
  trackName,
  artistName,
}: {
  lyrics: LyricsLookupResult;
  sourceLines: string[];
  targetLanguageCode: string;
  trackName: string;
  artistName: string;
}) {
  let translation: TranslationLookupResult;
  try {
    // Only the fallible call itself lives in the try — not the JSX below.
    // JSX construction doesn't execute a component's body immediately, so
    // wrapping a `return <Component />` in try/catch would not actually
    // catch an error from rendering it (ESLint's react-hooks/error-boundaries
    // rule flags exactly this).
    translation = await translateLyrics({ sourceLines, targetLanguageCode, trackName, artistName });
  } catch (error) {
    devError("TranslationSection: unexpected throw outside TranslationLookupResult", describeUnexpectedError(error));
    return <TranslationUnavailable lyrics={lyrics} />;
  }

  // Internal failure reasons (config_error/request_failed/invalid_response/
  // refused) stay distinct in the domain model but are never surfaced
  // separately here — one generic message covers all of them, and the
  // original lyrics the user already had remain visible.
  if (!translation.ok) {
    devLog("TranslationSection: translation failed", { reason: translation.reason });
    return <TranslationUnavailable lyrics={lyrics} />;
  }

  return <TranslatedLines data={translation.data} originalLines={sourceLines} />;
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
  const targetLanguageCode = resolveTargetLanguageCode(
    typeof params.lang === "string" ? params.lang : undefined,
  );

  const profile = await getCurrentUserProfile();
  const playback = profile.ok ? await getCurrentPlayback() : null;
  const currentTrack =
    playback?.ok && (playback.data.status === "playing" || playback.data.status === "paused")
      ? playback.data.track
      : null;
  const lyrics = currentTrack ? await getLyricsForTrack(currentTrack) : null;
  // Pure/synchronous gating: only render a translation Suspense boundary
  // (and only call OpenAI) when there is actually translatable content.
  const sourceLines = lyrics ? extractSourceLines(lyrics) : null;

  devLog("Home: lyric/translation gating state", {
    playbackStatus: playback?.ok ? playback.data.status : playback ? "playback_lookup_failed" : "not_checked",
    hasCurrentTrack: Boolean(currentTrack),
    lyricsLookupCalled: Boolean(currentTrack),
    lyricsOk: lyrics?.ok ?? null,
    lyricsStatus: lyrics?.ok ? lyrics.data.status : null,
    sourceLineCount: sourceLines?.length ?? null,
  });

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
            <form action="/" method="get" className="flex items-center gap-2">
              <label htmlFor="lang" className="text-xs text-zinc-500">
                Translate to
              </label>
              <LanguageSelect languages={SUPPORTED_TARGET_LANGUAGES} defaultValue={targetLanguageCode} />
            </form>
            {playback ? (
              playback.ok ? (
                <NowPlaying playback={playback.data} />
              ) : (
                <p className="text-sm text-zinc-500">
                  Couldn&apos;t check what&apos;s playing right now.
                </p>
              )
            ) : null}
            {lyrics ? (
              currentTrack && sourceLines ? (
                <Suspense fallback={<TranslationPending lyrics={lyrics} targetLanguageCode={targetLanguageCode} />}>
                  <TranslationSection
                    lyrics={lyrics}
                    sourceLines={sourceLines}
                    targetLanguageCode={targetLanguageCode}
                    trackName={currentTrack.name}
                    artistName={currentTrack.artistNames[0]}
                  />
                </Suspense>
              ) : (
                <Lyrics lyrics={lyrics} />
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
