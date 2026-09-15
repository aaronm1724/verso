const isDev = process.env.NODE_ENV === "development";

// Development-only diagnostics factory shared by every module that needs
// them, so each caller gets an identically-behaved, distinctly-prefixed
// logger without redefining the same guard/prefix logic. console.log, not
// console.error, for devLog: Next.js dev tooling forwards server-side
// console.error output to the browser as a red application-error overlay,
// which is misleading for expected, categorized branches — devError is
// reserved for genuinely unexpected failures only. Never pass secrets,
// tokens, lyric text, prompts, translations, or raw API bodies to either.
export function createDevLogger(scope: string): {
  devLog: (event: string, details?: Record<string, unknown>) => void;
  devError: (event: string, details?: Record<string, unknown>) => void;
} {
  function devLog(event: string, details?: Record<string, unknown>): void {
    if (!isDev) {
      return;
    }
    console.log(`[${scope}] ${event}`, details ?? "");
  }

  function devError(event: string, details?: Record<string, unknown>): void {
    if (!isDev) {
      return;
    }
    console.error(`[${scope}] ${event}`, details ?? "");
  }

  return { devLog, devError };
}
