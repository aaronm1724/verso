import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// createDevLogger reads NODE_ENV once at module-evaluation time (matching
// how it's actually used in production, where NODE_ENV is fixed for the
// process lifetime), so exercising both branches here requires resetting
// the module registry and re-importing after changing NODE_ENV — a plain
// re-import would keep evaluating against whatever NODE_ENV was set first.
// vi.stubEnv() is used instead of a direct assignment because @types/node
// declares process.env.NODE_ENV as read-only.
beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("createDevLogger", () => {
  it("logs via console.log with the given scope prefix in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { createDevLogger } = await import("./dev");
    const { devLog } = createDevLogger("test-scope");

    devLog("something happened", { detail: 1 });

    expect(logSpy).toHaveBeenCalledWith("[test-scope] something happened", { detail: 1 });
  });

  it("logs unexpected failures via console.error with the given scope prefix in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { createDevLogger } = await import("./dev");
    const { devError } = createDevLogger("test-scope");

    devError("unexpected throw");

    expect(errorSpy).toHaveBeenCalledWith("[test-scope] unexpected throw", "");
  });

  it("logs nothing outside development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { createDevLogger } = await import("./dev");
    const { devLog, devError } = createDevLogger("test-scope");

    devLog("event");
    devError("event");

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
