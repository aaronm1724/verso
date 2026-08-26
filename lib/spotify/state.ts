import { randomBytes, timingSafeEqual } from "crypto";

export const STATE_COOKIE_NAME = "verso_spotify_state";

export function generateState(): string {
  return randomBytes(16).toString("hex");
}

export function isValidState(expected: string | undefined, actual: string | undefined): boolean {
  if (!expected || !actual) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  // Lengths must match before timingSafeEqual, which throws on mismatched
  // buffer sizes rather than returning false.
  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}
