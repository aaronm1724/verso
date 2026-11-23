// Always-on, one-line JSON diagnostics so Vercel runtime logs can tell
// translation failure categories apart. createDevLogger stays development-only.
// Callers pass categorical metadata only: never lyrics, translations, prompts,
// keys, URLs, tokens, session data, or raw third-party error messages.
export function logEvent(event: string, details: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, ...details }));
}

type ErrorWithDetails = Error & {
  code?: unknown;
  status?: unknown;
  type?: unknown;
  requestID?: unknown;
  cause?: unknown;
};

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

// Drizzle wraps driver errors, so the Postgres code and name live on `cause`.
// The wrapper's own message embeds the query, which is why messages are never read.
export function describeErrorCategory(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { errorName: "UnknownThrownValue" };
  }

  const details = error as ErrorWithDetails;
  const cause = details.cause instanceof Error ? (details.cause as ErrorWithDetails) : null;

  return {
    errorName: error.name,
    errorCode: stringOrUndefined(details.code),
    errorStatus: typeof details.status === "number" ? details.status : undefined,
    errorType: stringOrUndefined(details.type),
    requestId: stringOrUndefined(details.requestID),
    causeName: cause?.name,
    causeCode: stringOrUndefined(cause?.code),
  };
}

// The model env var is the one config value safe to log, so surrounding
// whitespace or quotes show up escaped. A misplaced credential must not leak.
export function safeModelName(model: string | undefined): string | undefined {
  if (!model) {
    return undefined;
  }
  return model.length > 64 || /sk-|key|secret/i.test(model) ? "[redacted]" : model;
}

export function describeEnvValue(value: string | undefined): {
  present: boolean;
  hasSurroundingWhitespace: boolean;
  hasSurroundingQuotes: boolean;
} {
  if (!value) {
    return { present: false, hasSurroundingWhitespace: false, hasSurroundingQuotes: false };
  }
  const trimmed = value.trim();
  return {
    present: true,
    hasSurroundingWhitespace: trimmed !== value,
    hasSurroundingQuotes: /^["'`]|["'`]$/.test(trimmed),
  };
}
