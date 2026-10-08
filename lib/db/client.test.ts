import { beforeEach, describe, expect, it, vi } from "vitest";

const { postgresMock } = vi.hoisted(() => ({
  postgresMock: vi.fn(() => ({})),
}));

vi.mock("postgres", () => ({
  default: postgresMock,
}));

import { getDb } from "./client";

const globalForDb = globalThis as typeof globalThis & {
  __versoSql?: unknown;
  __versoDb?: unknown;
};

const fakeUrl = "postgres://verso:verso@127.0.0.1:5432/verso";

beforeEach(() => {
  postgresMock.mockClear();
  delete globalForDb.__versoSql;
  delete globalForDb.__versoDb;
  delete process.env.DATABASE_URL;
});

describe("getDb", () => {
  it("does not connect when DATABASE_URL is missing", () => {
    expect(getDb()).toBeNull();
    expect(postgresMock).not.toHaveBeenCalled();
  });

  it("opens one lazy pooler client with the runtime settings", () => {
    process.env.DATABASE_URL = fakeUrl;

    const first = getDb();
    const second = getDb();

    expect(first).toBe(second);
    expect(postgresMock).toHaveBeenCalledTimes(1);
    expect(postgresMock).toHaveBeenCalledWith(fakeUrl, {
      prepare: false,
      max: 1,
      connect_timeout: 3,
    });
  });
});
