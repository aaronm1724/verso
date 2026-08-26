import { cookies } from "next/headers";
import { getIronSession, type IronSession, type SessionOptions } from "iron-session";
import type { NextRequest, NextResponse } from "next/server";
import { refreshAccessToken } from "./oauth";

export type SpotifySession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

type SessionData = {
  spotify?: SpotifySession;
};

export const SESSION_COOKIE_NAME = "verso_session";
const REFRESH_MARGIN_MS = 60_000;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function sessionOptions(): SessionOptions {
  return {
    cookieName: SESSION_COOKIE_NAME,
    password: requiredEnv("SESSION_SECRET"),
    ttl: SESSION_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  };
}

export function needsRefresh(expiresAt: number, now: number = Date.now()): boolean {
  return expiresAt - now <= REFRESH_MARGIN_MS;
}

type RefreshOutcome =
  | { ok: true; session: SpotifySession }
  | { ok: false; reason: "reauth_required" };

async function performRefresh(refreshToken: string): Promise<RefreshOutcome> {
  const refreshed = await refreshAccessToken(refreshToken);
  if (!refreshed.ok) {
    return { ok: false, reason: "reauth_required" };
  }
  return {
    ok: true,
    session: {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: refreshed.expiresAt,
    },
  };
}

export type ResolveAccessTokenResult =
  | { ok: true; accessToken: string; session: SpotifySession; refreshed: boolean }
  | { ok: false; reason: "reauth_required" };

// Pure decision logic shared by every execution context (proxy, Route
// Handlers, Server Components): given a session and the current time, decide
// whether a refresh is needed and perform it. No cookie access here.
export async function resolveAccessToken(
  session: SpotifySession,
  now: number = Date.now(),
): Promise<ResolveAccessTokenResult> {
  if (!needsRefresh(session.expiresAt, now)) {
    return { ok: true, accessToken: session.accessToken, session, refreshed: false };
  }

  const refreshed = await performRefresh(session.refreshToken);
  if (!refreshed.ok) {
    return refreshed;
  }

  return {
    ok: true,
    accessToken: refreshed.session.accessToken,
    session: refreshed.session,
    refreshed: true,
  };
}

async function getSessionFromHeaders(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), sessionOptions());
}

function isCookieMutationDisallowed(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Cookies can only be modified");
}

// Server Components can read the session but Next.js forbids persisting
// cookie mutations during render (only Route Handlers, Server Actions, and
// proxy.ts may). Callers reached from a Server Component render still get a
// correct in-memory result; the persistence attempt is best-effort so a
// framework restriction never becomes a user-facing failure. proxy.ts already
// handles the common proactive-refresh case where persistence matters most.
async function bestEffortPersist(mutate: () => void | Promise<void>): Promise<void> {
  try {
    await mutate();
  } catch (error) {
    if (!isCookieMutationDisallowed(error)) {
      throw error;
    }
  }
}

export type AccessTokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: "reauth_required" };

export async function getValidAccessToken(): Promise<AccessTokenResult> {
  const session = await getSessionFromHeaders();
  if (!session.spotify) {
    return { ok: false, reason: "reauth_required" };
  }

  const result = await resolveAccessToken(session.spotify);

  if (!result.ok) {
    await bestEffortPersist(() => session.destroy());
    return result;
  }

  if (result.refreshed) {
    session.spotify = result.session;
    await bestEffortPersist(() => session.save());
  }

  return { ok: true, accessToken: result.accessToken };
}

// Used by client.ts after an unexpected 401: always refreshes regardless of
// the proactive margin, since the cached expiry can no longer be trusted.
export async function forceRefreshAccessToken(): Promise<AccessTokenResult> {
  const session = await getSessionFromHeaders();
  if (!session.spotify) {
    return { ok: false, reason: "reauth_required" };
  }

  const refreshed = await performRefresh(session.spotify.refreshToken);
  if (!refreshed.ok) {
    await bestEffortPersist(() => session.destroy());
    return refreshed;
  }

  session.spotify = refreshed.session;
  await bestEffortPersist(() => session.save());

  return { ok: true, accessToken: refreshed.session.accessToken };
}

export async function saveSpotifySession(spotify: SpotifySession): Promise<void> {
  const session = await getSessionFromHeaders();
  session.spotify = spotify;
  await session.save();
}

export async function clearSpotifySession(): Promise<void> {
  const session = await getSessionFromHeaders();
  session.destroy();
}

// proxy.ts is the one execution context that can always persist a cookie
// mutation before "/" renders, so it owns the proactive refresh-and-save
// path. NextRequest/NextResponse satisfy iron-session's Fetch API
// request/response overload directly.
export async function refreshSessionForProxy(
  request: NextRequest,
  response: NextResponse,
): Promise<void> {
  const session = await getIronSession<SessionData>(request, response, sessionOptions());

  if (!session.spotify || !needsRefresh(session.spotify.expiresAt)) {
    return;
  }

  const refreshed = await performRefresh(session.spotify.refreshToken);
  if (!refreshed.ok) {
    session.destroy();
    return;
  }

  session.spotify = refreshed.session;
  await session.save();
}
