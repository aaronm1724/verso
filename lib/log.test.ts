import { afterEach, describe, expect, it, vi } from "vitest";

import { describeEnvValue, describeErrorCategory, logEvent, safeModelName } from "./log";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logEvent", () => {
  it("prints one JSON line with the event name first", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    logEvent("translation.cache_hit", { targetLanguage: "en", sourceLineCount: 3 });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(spy.mock.calls[0][0] as string)).toEqual({
      event: "translation.cache_hit",
      targetLanguage: "en",
      sourceLineCount: 3,
    });
  });
});

describe("describeErrorCategory", () => {
  it("keeps names and codes, never the message, and reads the cause", () => {
    const cause = Object.assign(new Error("password=secret"), { name: "PostgresError", code: "28P01" });
    const error = Object.assign(new Error("Failed query: select ... params: secret"), {
      name: "DrizzleQueryError",
      cause,
    });

    const details = describeErrorCategory(error);

    expect(details).toMatchObject({
      errorName: "DrizzleQueryError",
      causeName: "PostgresError",
      causeCode: "28P01",
    });
    expect(JSON.stringify(details)).not.toContain("secret");
  });

  it("keeps OpenAI status, code, type, and request id", () => {
    const error = Object.assign(new Error("Incorrect API key sk-live"), {
      name: "AuthenticationError",
      status: 401,
      code: "invalid_api_key",
      type: "invalid_request_error",
      requestID: "req_123",
    });

    const details = describeErrorCategory(error);

    expect(details).toMatchObject({
      errorStatus: 401,
      errorCode: "invalid_api_key",
      errorType: "invalid_request_error",
      requestId: "req_123",
    });
    expect(JSON.stringify(details)).not.toContain("sk-live");
  });

  it("handles non-Error throws", () => {
    expect(describeErrorCategory("boom")).toEqual({ errorName: "UnknownThrownValue" });
  });
});

describe("safeModelName", () => {
  it("keeps model ids exactly and redacts anything credential-shaped", () => {
    expect(safeModelName("gpt-5.6-luna")).toBe("gpt-5.6-luna");
    expect(safeModelName("gpt-5.6-luna\n")).toBe("gpt-5.6-luna\n");
    expect(safeModelName("sk-proj-abc")).toBe("[redacted]");
    expect(safeModelName("x".repeat(65))).toBe("[redacted]");
    expect(safeModelName(undefined)).toBeUndefined();
  });
});

describe("describeEnvValue", () => {
  it("flags missing, padded, and quoted values without returning them", () => {
    expect(describeEnvValue(undefined)).toEqual({
      present: false,
      hasSurroundingWhitespace: false,
      hasSurroundingQuotes: false,
    });
    expect(describeEnvValue("gpt-5.6-luna\n")).toMatchObject({ hasSurroundingWhitespace: true });
    expect(describeEnvValue('"sk-abc"')).toMatchObject({ hasSurroundingQuotes: true });
    expect(describeEnvValue("sk-abc")).toEqual({
      present: true,
      hasSurroundingWhitespace: false,
      hasSurroundingQuotes: false,
    });
  });
});
