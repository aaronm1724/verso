// Shared by oauth.ts and session.ts, which both need the same required-env
// contract. lib/translation/openai.ts intentionally has its own non-throwing
// variant instead of using this — a missing OpenAI env var should degrade to
// a typed config_error, not throw and take down the whole page render.
export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
