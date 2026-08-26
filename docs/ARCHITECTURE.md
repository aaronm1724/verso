# Verso — Architecture Decisions

This document records architectural decisions that should not be silently revisited during implementation.

If a future implementation conflicts with one of these decisions, stop and explicitly explain the conflict before changing direction.

## Application Architecture

Verso is a single unified Next.js App Router application.

Do not split it into:

- a separate Vite frontend
- a separate Express backend
- `/client` and `/server` applications

Next.js route handlers provide the server-side boundary for external API and authentication logic.

## TypeScript

Use strict TypeScript.

Avoid:

- implicit `any`
- `as any`
- leaking large third-party API response shapes throughout the app

External API responses should be normalized into Verso-owned domain types.

## Spotify

Spotify is used for:

- authentication
- identifying the connected account
- current playback metadata
- playback position/state

Spotify's public Web API does not expose lyric text.

### OAuth

Use Spotify Authorization Code Flow because Verso has a server runtime capable of securely storing the Spotify client secret.

Current development redirect URI:

`http://127.0.0.1:3000/api/auth/callback/spotify`

Local development must be accessed at `http://127.0.0.1:3000`, never `http://localhost:3000`. Spotify requires loopback IP literals (not `localhost`) for local HTTP redirect URIs, and the OAuth state cookie is scoped to whichever host starts the flow — starting from `localhost` while Spotify redirects back to `127.0.0.1` drops the state cookie and produces a false `state_mismatch`. `npm run dev` binds explicitly to `127.0.0.1` (`next dev -H 127.0.0.1`) so the whole flow stays on one host.

Next.js 16's dev server normalizes a `127.0.0.1` request host to `localhost` when constructing `request.url` in Route Handlers (a known upstream bug, vercel/next.js#79182). Building a redirect target from `new URL("/", request.url)` therefore silently sends the browser to a different origin and strands any origin-scoped cookie set on that response. Route Handlers that redirect back into the app (`/api/auth/callback/spotify`, `/api/auth/spotify/logout`) build their redirect origin from `lib/http.ts`'s `resolveRequestOrigin()`, which reads the `Host`/`X-Forwarded-Host` header directly instead of relying on `request.url`.

### Phase 1 scopes

Request only:

`user-read-playback-state`

No `user-read-email` or `user-read-private` scope is currently required.

The `/me` response provides enough unscoped profile information to prove the connected account.

### Session handling

Phase 1 uses `iron-session`.

Spotify access and refresh tokens remain server-side and are stored only inside the encrypted/tamper-proof session cookie.

Do not store Spotify tokens in:

- localStorage
- sessionStorage
- browser-visible React state
- client-visible JSON responses
- logs

### Token lifecycle

Spotify access-token refresh must be centralized.

Requirements:

- track access-token expiration
- proactively refresh near expiration
- preserve the old refresh token when Spotify does not rotate it
- retry an unexpected authenticated request failure at most once
- never enter an infinite refresh loop
- clear unusable auth state and require reconnection when refresh credentials become invalid

### Session mutation boundary

Next.js Server Components can read cookies during render but cannot persist cookie mutations — only Route Handlers, Server Actions, and `proxy.ts` can. Since `app/page.tsx` calls `lib/spotify/session.ts`/`client.ts` directly, proactive token refresh needs a mutation-capable context to run in before the page renders.

**Decision: root-level `proxy.ts`, matched only to `/`.**

- Next.js 16 renamed `middleware.ts` to `proxy.ts` (exported function `proxy`, not `middleware`); it defaults to the Node.js runtime.
- `matcher: ["/"]` restricts it to the one Phase 1 page that reads session state — it does not run on `/api/*` routes or static assets.
- For anonymous requests (no session cookie) or sessions not near expiry, it returns immediately without calling Spotify.
- For a near-expiry session, it refreshes via the same centralized decision logic used everywhere else (`needsRefresh`/`resolveAccessToken` in `lib/spotify/session.ts`) and persists the result through the response's `Set-Cookie` header, using `iron-session`'s `getIronSession(request, response, options)` overload — `NextRequest`/`NextResponse` satisfy the Fetch API `Request`/`Response` shape this overload expects, so `session.save()` genuinely persists here.
- Server Components never own cookie persistence; `proxy.ts` and the Route Handlers (login/callback/logout) do.

**Bounded unexpected-401 behavior:** if Spotify returns an unexpected `401` during `page.tsx`'s own `/v1/me` call despite `proxy.ts` having just validated the token, `lib/spotify/client.ts` still forces exactly one refresh and one retry, using the refreshed token for that render. The persistence attempt is best-effort: if called from a context that disallows cookie mutation, it is skipped rather than treated as a fatal error. This is safe because Verso uses the standard (non-PKCE) Authorization Code flow, where Spotify does not invalidate a refresh token when a new one is issued — the still-cookie-stored refresh token remains valid, and the next request through `proxy.ts` persists the corrected session. No extra machinery was added solely to close this rare, self-healing case.

**Why not client-side or an internal Route Handler fetch:** a Server Component fetching its own new `/api/auth/spotify/me` Route Handler internally cannot forward that handler's `Set-Cookie` onto the outer page response — the persisted cookie would never reach the browser. Moving profile display into a Client Component that fetches that route from the browser would work, but reintroduces the JSON endpoint this plan avoids, adds a loading/flicker state, and is a larger change than one root-level file.

## Lyrics

The MVP lyric source is LRCLIB.

Pipeline:

Spotify track metadata

→ LRCLIB lookup

→ synchronized lyrics if available

→ plain lyrics if available

→ clean not-found state

Do not automatically scrape arbitrary lyric websites as an MVP fallback.

The UI should consume Verso-owned lyric types, not raw LRCLIB response structures.

## OpenAI

OpenAI is used for translation only after lyrics have been retrieved.

Do not ask OpenAI to generate or retrieve lyrics.

When introduced:

- use Structured Outputs
- validate results with Zod
- keep the model configurable through environment configuration
- preserve the original lyric separately
- do not fabricate missing lines or metadata

## Database

Do not introduce PostgreSQL/Supabase until the translation pipeline works end-to-end.

The first intended uses are:

- translation caching
- target-language preference
- lightweight user preferences

Avoid speculative schema design.

## PWA

PWA/service-worker functionality is deferred until the responsive mobile web experience works.

When introduced:

- do not cache authenticated Spotify responses
- do not cache live playback responses
- do not silently force disruptive mid-session updates
- use deliberate update behavior

## Development Strategy

Implement one phase at a time.

For each phase:

1. inspect the current repo
2. plan the smallest meaningful change
3. review the plan
4. implement the approved scope
5. run automated checks
6. perform manual testing
7. report files changed and decisions made
8. stop before the next phase

Do not silently implement future phases.



This document records decisions that should survive across Cursor conversations and context resets.

When a previously documented decision changes, update this file rather than leaving contradictory historical guidance in place.