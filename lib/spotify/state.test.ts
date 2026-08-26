import { describe, expect, it } from "vitest";
import { generateState, isValidState } from "./state";

describe("generateState", () => {
  it("generates sufficiently random, non-empty values", () => {
    const a = generateState();
    const b = generateState();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });
});

describe("isValidState", () => {
  it("accepts a matching state", () => {
    const state = generateState();
    expect(isValidState(state, state)).toBe(true);
  });

  it("rejects a missing expected (cookie) state", () => {
    expect(isValidState(undefined, "abc")).toBe(false);
  });

  it("rejects a missing actual (query param) state", () => {
    expect(isValidState("abc", undefined)).toBe(false);
  });

  it("rejects both missing", () => {
    expect(isValidState(undefined, undefined)).toBe(false);
  });

  it("rejects a mismatched state", () => {
    expect(isValidState("abc", "def")).toBe(false);
  });

  it("rejects states of different lengths without throwing", () => {
    expect(isValidState("abc", "abcd")).toBe(false);
  });
});
