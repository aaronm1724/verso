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

### Phase 2 — current playback

Current playback is read through `GET /v1/me/player`, not `/v1/me/player/currently-playing`. The two endpoints require different scopes (`user-read-playback-state` vs. `user-read-currently-playing`); `/v1/me/player` matches the scope already granted in Phase 1, so no scope change or user re-consent is required, and it already returns everything Phase 2 needs (`item`, `is_playing`, `progress_ms`, `currently_playing_type`).

`/v1/me/player` returns `204 No Content` when there is no active device. `lib/spotify/client.ts`'s `spotifyFetch<T>` handles this generically (`response.status === 204` short-circuits to `{ ok: true, data: null }` before attempting to parse a body) since this is real HTTP behavior any endpoint could exhibit, not something specific to playback. Its return type is `SpotifyRequestResult<T | null>`; `getCurrentUserProfile()` guards against a null `/me` body defensively even though `/me` does not return `204` in practice.

By default, Spotify only populates the `item` field for the default `track` type — a playing podcast episode comes back with `currently_playing_type: "episode"` but `item: null` unless the request opts in with `additional_types`. `playback.ts` requests `/me/player?additional_types=episode` so episodes are represented, and classifies `currently_playing_type` (`episode`/`ad`/`unknown` → `non_track`) **before** checking whether `item` is null — ads and `unknown` never have a representable `item` regardless of `additional_types`, so checking item-nullity first would misclassify Spotify-identified non-track content as `idle`. `idle` is reserved for a true `204`, or `currently_playing_type: "track"` (or an unrecognized value) with a null `item`.

Playback normalization lives in its own module, `lib/spotify/playback.ts`, separate from `client.ts`'s `getCurrentUserProfile()`: the raw shape (nested track/artists/album, a nullable `item`, a `currently_playing_type` discriminator) is materially more complex than `/me`, which justifies a dedicated module now rather than growing `client.ts` into a per-endpoint dumping ground.

`CurrentPlayback` is a five-state domain type:

- `playing` / `paused` — a normalized `SpotifyTrack` plus `progressMs`.
- `idle` — no active device (`204`), or `currently_playing_type: "track"` (or an unrecognized value) with a null `item`.
- `non_track` — well-formed playback where `currently_playing_type` is `"episode"`, `"ad"`, or `"unknown"`.
- `unavailable` — `currently_playing_type: "track"` but the `item` is missing a field Verso requires; kept distinct from `non_track` so a genuinely malformed Spotify response is distinguishable from expected non-track content, even though Phase 2's UI shows both with the same fallback message.

A track normalizes only if it has `id`, `name`, `duration_ms`, and at least one artist with a name — the fields later lyrics/playback-sync phases actually depend on. Album name and artwork are display-only and degrade to `null` on an otherwise-valid track instead of making it `unavailable`.

`app/page.tsx` calls `getCurrentPlayback()` directly as part of the same Server Component render used for the profile chip (only when the profile fetch succeeds) — no new route handler, client component, or polling. This is a static per-request snapshot, the same accepted tradeoff already documented for `/me`. Local playback-position interpolation and periodic re-sync are deliberately deferred to Phase 5.

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

### Phase 3 — LRCLIB lookup

Lyrics are looked up with a single call to LRCLIB's `GET /api/get`, not `/api/search`. `/api/search` returns up to 20 results with no duration filtering, which would require Verso to build its own disambiguation logic; `/api/get`'s server-enforced duration match (exact, or within ±2 seconds) is the deterministic anti-false-match mechanism instead. The accepted tradeoff is real coverage loss: some tracks findable by hand in LRCLIB's search will surface as `not_found` here. Adding `/api/search` as a fallback would be a deliberate, separately-evaluated decision, not something Phase 3 backs into.

Query parameters sent to `/api/get`:

- `track_name` — Spotify's track name, trimmed only.
- `artist_name` — the **primary (first) Spotify artist only**, not a joined multi-artist string. LRCLIB stores one artist string per record.
- `album_name` — Spotify's album name when present, omitted otherwise (recommended, not required).
- `duration` — `Math.round(track.durationMs / 1000)`.

Titles are passed verbatim — suffixes like "(feat. ...)", "- Remastered 2011", "(Live)", or "(Acoustic)" are never stripped. LRCLIB stores per-recording titles, so an exact title is safer against cross-version false matches than a "cleaned up" string; a genuinely missing version should surface as `not_found`, not a wrong match.

Only `plainLyrics` and the legacy line-synced `syncedLyrics` string are read. LRCLIB's newer `lyricsfile` (YAML) field is deliberately ignored — nothing in the current roadmap needs whatever richer synchronization it offers beyond `syncedLyrics`, and consuming it would add a YAML dependency for no current benefit. Revisiting this is a future, explicit decision.

`syncedLyrics` is parsed into `SyncedLyricLine[]` (`{ startTimeMs: number; text: string }`) now, in `lib/lyrics/syncedLyrics.ts`, rather than deferred to Phase 5 — LRC's `[mm:ss.xx]text` format has one canonical structured representation, and parsing now keeps external format details out of `app/page.tsx`. Trailing timestamp-only lines (empty text) are preserved, not filtered, since they are meaningful end-of-song/gap markers that Phase 5 will need for correct timing. Non-timestamp metadata lines (e.g. `[au: instrumental]`) are silently skipped. If `syncedLyrics` parses to zero usable lines, the result falls back to `plain` (or `unavailable`) rather than ever returning `synced` with an empty `lines` array.

`LyricsResult` is a five-state domain type (`lib/lyrics/types.ts`): `synced`, `plain`, `instrumental`, `not_found`, `unavailable`. `instrumental` is LRCLIB's own explicit flag, not inferred from empty text. `not_found` (a confirmed `404`) and `unavailable` (a record exists but has no usable lyric content) are kept distinct, mirroring the Phase 2 precedent of separating expected non-content from malformed provider data, even though the current UI shows both with the same fallback copy. Request-level failures (network errors, non-404 error statuses, malformed JSON) are a separate `LyricsLookupResult` wrapper with `reason: "lookup_failed"` — LRCLIB requires honoring `429`'s `Retry-After` header if hit, but Phase 3's one-lookup-per-render behavior does not implement an automatic retry/backoff loop; a `429` simply becomes `lookup_failed`.

A `synced` result's `plainText` is LRCLIB's `plainLyrics` when non-empty, otherwise derived by joining the parsed `SyncedLyricLine[]`'s non-empty text with `\n`. This guarantees a valid synced match always carries usable source text for Phase 4 translation without ever being discarded just because `plainLyrics` was unexpectedly null/empty.

LRCLIB is unauthenticated and has none of Spotify's OAuth/session/retry concerns, so `lib/lyrics/lrclib.ts` has no shared HTTP abstraction with `lib/spotify`. It does require a `User-Agent` identifying the client; Verso sends `Verso/<package.json version> (<package.json homepage>)`, reading both values from `package.json` (a real `homepage` field pointing at Verso's GitHub repository) rather than a placeholder.

Lyrics lookup is gated strictly by `CurrentPlayback.status` being `playing` or `paused`, evaluated in the same `app/page.tsx` Server Component render used for playback — no new route, client component, or polling. This is the same static per-request snapshot tradeoff already accepted for `/me` and playback.

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