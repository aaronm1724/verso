export const LYRIC_TICK_MS = 250;
export const STALE_SNAPSHOT_MS = 10_000;
export const SYNCED_POLL_INTERVAL_MS = 3_000;
export const WATCH_POLL_INTERVAL_MS = 5_000;

export type ProgressSnapshot = {
  progressMs: number;
  isPlaying: boolean;
  receivedAtMs: number;
};

export function estimateProgressMs(
  snapshot: ProgressSnapshot,
  nowMs: number,
  durationMs: number,
): number {
  const raw = snapshot.isPlaying
    ? snapshot.progressMs + (nowMs - snapshot.receivedAtMs)
    : snapshot.progressMs;
  return Math.min(Math.max(raw, 0), durationMs);
}

export function isSnapshotStale(lastGoodSnapshotAt: number, nowMs: number): boolean {
  return nowMs - lastGoodSnapshotAt > STALE_SNAPSHOT_MS;
}

// Last index whose timestamp has been reached. Binary search is enough for
// typical song sizes and stays correct after seeks without extra cursor state.
export function getActiveLyricIndex(lines: { startTimeMs: number }[], positionMs: number): number {
  let low = 0;
  let high = lines.length - 1;
  let result = -1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lines[mid].startTimeMs <= positionMs) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return result;
}
