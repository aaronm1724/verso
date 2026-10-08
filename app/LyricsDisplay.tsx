import { createDevLogger } from "@/lib/dev";
import type { LyricsLookupResult, SyncedLyricLine } from "@/lib/lyrics/types";
import { getLanguageLabel } from "@/lib/translation/languages";
import type { TranslatedLyricLine, TranslationResult } from "@/lib/translation/types";

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

  // Same copy for both. The domain states stay distinct.
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

export type DisplayLyricLine = {
  startTimeMs: number;
  originalText: string;
  translatedText: string;
};

export function zipDisplayLyricLines(
  syncedLines: SyncedLyricLine[],
  translatedLines: TranslatedLyricLine[],
): DisplayLyricLine[] {
  return syncedLines.map((line, index) => ({
    startTimeMs: line.startTimeMs,
    originalText: line.text,
    translatedText: translatedLines[index]?.translatedText ?? "",
  }));
}

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

// Original lyrics plus one generic note, for a failed translation and for
// an unexpected throw.
export function TranslationUnavailable({ lyrics }: { lyrics: LyricsLookupResult }) {
  return (
    <div className="flex flex-col gap-2">
      <Lyrics lyrics={lyrics} />
      <p className="text-sm text-zinc-500">{TRANSLATION_FAILURE_MESSAGE}</p>
    </div>
  );
}

// Status is above the lyrics. After a long block it would be off screen.
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
