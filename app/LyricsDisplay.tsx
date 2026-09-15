import { createDevLogger } from "@/lib/dev";
import type { LyricsLookupResult } from "@/lib/lyrics/types";
import { getLanguageLabel } from "@/lib/translation/languages";
import type { TranslationResult } from "@/lib/translation/types";

// Pure presentation for the lyric/translation region — no data fetching, no
// OpenAI/Spotify imports. Kept separate from app/page.tsx's orchestration
// (Home, TranslationSection) so Phase 5's client-side playback-following
// work has a small, already-isolated rendering boundary to build against
// instead of extracting it out of a much larger file at that point.

const { devLog } = createDevLogger("page");

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

export function TranslatedLines({
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
// (never expected, but defended against in TranslationSection) case where
// something throws instead of resolving — the user sees the same thing
// either way.
export function TranslationUnavailable({ lyrics }: { lyrics: LyricsLookupResult }) {
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
