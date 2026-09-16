"use client";

import { useEffect, useRef, useState } from "react";

import { usePlaybackSnapshot } from "./PlaybackMonitor";
import type { DisplayLyricLine } from "./LyricsDisplay";
import { estimateProgressMs, getActiveLyricIndex, isSnapshotStale, LYRIC_TICK_MS } from "@/lib/lyrics/playbackSync";
import { getLanguageLabel } from "@/lib/translation/languages";

const PROGRAMMATIC_SCROLL_MS = 600;

export function SyncedLyricsPlayer({
  trackId,
  durationMs,
  lines,
  sourceLanguage,
  targetLanguage,
}: {
  trackId: string;
  durationMs: number;
  lines: DisplayLyricLine[];
  sourceLanguage: string;
  targetLanguage: string;
}) {
  const snapshot = usePlaybackSnapshot();
  const snapshotForTrack = snapshot?.trackId === trackId ? snapshot : null;
  const [activeIndex, setActiveIndex] = useState(-1);
  const [autoFollow, setAutoFollow] = useState(true);
  const frozenProgressRef = useRef<number | null>(null);
  const lastGoodRef = useRef(0);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const programmaticUntilRef = useRef(0);

  useEffect(() => {
    if (!snapshotForTrack) {
      return;
    }
    lastGoodRef.current = snapshotForTrack.receivedAtMs;
    frozenProgressRef.current = null;
  }, [snapshotForTrack]);

  useEffect(() => {
    function tick() {
      const now = Date.now();
      if (!snapshotForTrack) {
        setActiveIndex((current) => (current === -1 ? current : -1));
        return;
      }

      let positionMs: number;
      if (isSnapshotStale(lastGoodRef.current, now)) {
        if (frozenProgressRef.current === null) {
          frozenProgressRef.current = estimateProgressMs(snapshotForTrack, now, durationMs);
        }
        positionMs = frozenProgressRef.current;
      } else {
        frozenProgressRef.current = null;
        positionMs = estimateProgressMs(snapshotForTrack, now, durationMs);
      }

      const next = getActiveLyricIndex(lines, positionMs);
      setActiveIndex((current) => (current === next ? current : next));
    }

    tick();
    const intervalId = window.setInterval(tick, LYRIC_TICK_MS);
    return () => window.clearInterval(intervalId);
  }, [snapshotForTrack, durationMs, lines]);

  useEffect(() => {
    if (!autoFollow || activeIndex < 0) {
      return;
    }
    const line = lines[activeIndex];
    if (!line || line.originalText.trim().length === 0) {
      return;
    }
    const element = lineRefs.current[activeIndex];
    if (!element) {
      return;
    }
    programmaticUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_MS;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeIndex, autoFollow, lines]);

  useEffect(() => {
    function onScroll() {
      if (Date.now() < programmaticUntilRef.current) {
        return;
      }
      setAutoFollow(false);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const alreadyInTargetLanguage = sourceLanguage === targetLanguage;

  return (
    <div className={`flex flex-col gap-2 ${autoFollow ? "" : "pb-16"}`}>
      <div className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm leading-relaxed">
        {alreadyInTargetLanguage ? (
          <p className="text-xs text-zinc-500">Already in {getLanguageLabel(targetLanguage)}.</p>
        ) : null}
        {lines.map((line, index) => {
          if (line.originalText.trim().length === 0) {
            return null;
          }
          const isActive = index === activeIndex;
          return (
            <div
              key={index}
              ref={(element) => {
                lineRefs.current[index] = element;
              }}
              className={`flex flex-col gap-0.5 transition-all duration-300 ${
                isActive ? "scale-[1.02] font-semibold" : "scale-100 font-normal opacity-60"
              }`}
            >
              <p className={isActive ? "text-zinc-50" : "text-zinc-300"}>{line.originalText}</p>
              <p className={isActive ? "text-zinc-300" : "text-zinc-500"}>{line.translatedText}</p>
            </div>
          );
        })}
      </div>
      {autoFollow ? null : (
        <button
          type="button"
          onClick={() => setAutoFollow(true)}
          className="fixed bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full border border-zinc-600 bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-50 shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100"
        >
          Resume following
        </button>
      )}
    </div>
  );
}
