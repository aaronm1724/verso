import { describe, expect, it } from "vitest";

import { resolveTargetLanguageCode } from "./languages";

describe("resolveTargetLanguageCode", () => {
  it("prefers a supported query code over the cookie", () => {
    expect(resolveTargetLanguageCode("fr", "es")).toBe("fr");
  });

  it("uses the cookie when the query is absent or unsupported", () => {
    expect(resolveTargetLanguageCode(undefined, "es")).toBe("es");
    expect(resolveTargetLanguageCode("xx", "es")).toBe("es");
  });

  it("falls back to English when neither is supported", () => {
    expect(resolveTargetLanguageCode(undefined, undefined)).toBe("en");
    expect(resolveTargetLanguageCode("xx", "yy")).toBe("en");
  });
});
