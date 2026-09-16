# Verso — Architecture Decisions

This document records architectural decisions, constraints, and non-obvious framework/API behavior that future implementation must respect. It is not a changelog — Git history covers implementation chronology. If a future implementation conflicts with a decision here, stop and explain the conflict before changing direction. When a decision changes, update this file in place rather than leaving contradictory guidance.

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

Use Spotify Authorization Code Flow (Verso has a server runtime capable of securely storing the client secret).

Current development redirect URI: `http://127.0.0.1:3000/api/auth/callback/spotify`.

Local development must be accessed at `http://127.0.0.1:3000`, never `http://localhost:3000`. Spotify requires loopback IP literals (not `localhost`) for local HTTP redirect URIs, and the OAuth state cookie is scoped to whichever host starts the flow — starting from `localhost` while Spotify redirects back to `127.0.0.1` drops the state cookie and produces a false `state_mismatch`. `npm run dev` binds explicitly to `127.0.0.1` (`next dev -H 127.0.0.1`) so the whole flow stays on one host.

Next.js 16's dev server normalizes a `127.0.0.1` request host to `localhost` when constructing `request.url` in Route Handlers (known upstream bug, vercel/next.js#79182). Building a redirect target from `new URL("/", request.url)` therefore silently sends the browser to a different origin and strands any origin-scoped cookie set on that response. Route Handlers that redirect back into the app (`/api/auth/callback/spotify`, `/api/auth/spotify/logout`) build their redirect origin from `lib/http.ts`'s `resolveRequestOrigin()`, which reads the `Host`/`X-Forwarded-Host` header directly instead of relying on `request.url`.

### Scopes

Request only: `user-read-playback-state`.

No `user-read-email` or `user-read-private` scope is currently required. `/me` provides enough unscoped profile information to prove the connected account.

### Session handling

Verso uses `iron-session`. Spotify access and refresh tokens remain server-side, stored only inside the encrypted/tamper-proof session cookie.

Do not store Spotify tokens in:

- localStorage
- sessionStorage
- browser-visible React state
- client-visible JSON responses
- logs

### Token lifecycle

Spotify access-token refresh is centralized. Requirements:

- track access-token expiration
- proactively refresh near expiration
- preserve the old refresh token when Spotify does not rotate it
- retry an unexpected authenticated request failure at most once
- never enter an infinite refresh loop
- clear unusable auth state and require reconnection when refresh credentials become invalid

### Session mutation boundary

Next.js Server Components can read cookies during render but cannot persist cookie mutations — only Route Handlers, Server Actions, and `proxy.ts` can. Since `app/page.tsx` calls `lib/spotify/session.ts`/`client.ts` directly, proactive refresh needs a mutation-capable context to run before the page renders.

**Decision: root-level `proxy.ts`, matched only to `/`.** Next.js 16 renamed `middleware.ts` to `proxy.ts` (exported function `proxy`, not `middleware`; Node.js runtime by default). `matcher: ["/"]` restricts it to the page that reads session state, so it does not run on `/api/*` routes or static assets. For anonymous requests or sessions not near expiry it returns immediately without calling Spotify. For a near-expiry session it refreshes via the same centralized logic used everywhere else (`needsRefresh`/`resolveAccessToken` in `lib/spotify/session.ts`) and persists the result through the response's `Set-Cookie` header using `iron-session`'s `getIronSession(request, response, options)` overload — `NextRequest`/`NextResponse` satisfy the Fetch API `Request`/`Response` shape this overload expects, so `session.save()` genuinely persists here. Server Components never own cookie persistence; `proxy.ts` and the Route Handlers (login/callback/logout) do.

**Bounded unexpected-401 behavior:** if Spotify returns an unexpected `401` during a Server Component's own Spotify request (e.g. `page.tsx`'s `/v1/me` call) despite `proxy.ts` having just validated the token, `lib/spotify/client.ts` still forces exactly one refresh and one retry, using the refreshed token for that render. The persistence attempt is best-effort — if the context disallows cookie mutation, it is skipped rather than treated as a fatal error. This is safe because Verso uses the standard (non-PKCE) Authorization Code flow, where Spotify does not invalidate a refresh token when a new one is issued: the still-cookie-stored refresh token remains valid, and the next request through `proxy.ts` persists the corrected session.

**Request-scoped token/session memoization:** `lib/spotify/session.ts`'s `getValidAccessToken()` and `forceRefreshAccessToken()` are wrapped in React's `cache()`, scoped to the single Server Component render/request that calls them. Within that one render, every caller — currently `getCurrentUserProfile()`'s and `getCurrentPlayback()`'s `spotifyFetch()` calls — shares one memoized session-cookie unseal and, near expiry, one shared refresh; neither caller independently re-unseals the cookie or hits Spotify's token endpoint a second time. The same applies to `forceRefreshAccessToken()`: multiple unexpected-401 retries within one render share a single forced refresh. This does not persist across separate browser/server requests — each new render gets its own `cache()` scope, and the wrapped functions still read that request's cookies fresh. **This is deliberately narrow: it does not claim, and does not need, any coordination with `proxy.ts`.** `proxy.ts` runs before the page renders, in a plain middleware/route-matching context with no React render tree and therefore no `cache()` scope of its own — its proactive refresh (above) and this render-scoped memoization are two separate, uncoordinated refresh paths, exactly as before this change. Browser-driven playback polls (`GET /api/playback/current`) are separate Route Handler requests, each with their own `cache()` scope and a single internal caller (`getCurrentPlayback()` → `getValidAccessToken()`), so there is nothing to deduplicate there. Unlike a Server Component render, a Route Handler *can* persist a refreshed session cookie, so a token refresh triggered by a poll sticks without relying on `proxy.ts`'s `/`-only matcher.

### Current playback

Current playback is read through `GET /v1/me/player`, not `/v1/me/player/currently-playing` — the two require different scopes, and `/v1/me/player` matches the scope already granted above while returning everything needed (`item`, `is_playing`, `progress_ms`, `currently_playing_type`).

`/v1/me/player` returns `204 No Content` when there is no active device. `lib/spotify/client.ts`'s `spotifyFetch<T>` handles this generically (`response.status === 204` short-circuits to `{ ok: true, data: null }` before parsing a body), since this is real HTTP behavior any endpoint could exhibit. Its return type is `SpotifyRequestResult<T | null>`.

Spotify only populates `item` for the default `track` type unless the request opts in with `additional_types` — a playing podcast episode otherwise comes back with `currently_playing_type: "episode"` but `item: null`. `playback.ts` requests `/me/player?additional_types=episode`, and classifies `currently_playing_type` (`episode`/`ad`/`unknown` → `non_track`) **before** checking whether `item` is null — ads and `unknown` never have a representable `item` regardless of `additional_types`, so checking item-nullity first would misclassify them as `idle`. `idle` is reserved for a true `204`, or `currently_playing_type: "track"` (or an unrecognized value) with a null `item`.

Playback normalization lives in its own module, `lib/spotify/playback.ts`, separate from `client.ts`.

`CurrentPlayback` is a five-state domain type:

- `playing` / `paused` — a normalized `SpotifyTrack` plus `progressMs`.
- `idle` — no active device (`204`), or `currently_playing_type: "track"` (or unrecognized) with a null `item`.
- `non_track` — well-formed playback where `currently_playing_type` is `"episode"`, `"ad"`, or `"unknown"`.
- `unavailable` — `currently_playing_type: "track"` but `item` is missing a field Verso requires; kept distinct from `non_track` so a malformed Spotify response is distinguishable from expected non-track content, even though the UI currently shows both with the same fallback message.

A track normalizes only if it has `id`, `name`, `duration_ms`, and at least one artist with a name. Album name/artwork are display-only and degrade to `null` on an otherwise-valid track instead of making it `unavailable`.

`app/page.tsx` calls `getCurrentPlayback()` directly in the same Server Component render used for the profile chip (only when the profile fetch succeeds). That value is the initial snapshot for the page; live follow uses the client poll loop described under Playback-aligned lyrics below. Tokens still never leave the server.

## Playback-aligned lyrics

Playback monitoring and lyric highlighting are split across two Client Components. `Home()` stays a Server Component. Unauthenticated users do not mount a monitor and do not poll.

**`PlaybackMonitor`** (`app/PlaybackMonitor.tsx`) wraps the authenticated UI (idle, non-track, plain lyrics, lyric-unavailable, and synced). It owns the **only** `GET /api/playback/current` poll loop, a `visibilitychange` resync, `resolvePollOutcome()`, and the in-flight `router.refresh()` guard. It provides a tiny React context of the latest successful snapshot: `{ progressMs, isPlaying, receivedAtMs, trackId, durationMs }`. No tokens, no raw Spotify JSON.

**`SyncedLyricsPlayer`** (`app/SyncedLyricsPlayer.tsx`) mounts only after translation resolves for **synced** lyrics. It owns the **250ms interpolation tick**, active-index, highlighting, and auto-scroll. It does not fetch. It consumes snapshots from `PlaybackMonitor` context. `<SyncedLyricsPlayer key={trackId} />` remounts on track change.

**Poll endpoint:** `GET /api/playback/current` is a thin Route Handler around `getCurrentPlayback()`. It returns `SpotifyRequestResult<CurrentPlayback>` JSON — already Verso-owned and serializable, with no session secrets. A Route Handler is the right shape for a periodic, idempotent, read-only poll; a Server Action would add POST-oriented indirection with no benefit.

**Cadence (one loop, two intervals, chosen from the currently rendered lyric/playback mode):**

- **3s** while a synced track is on screen (playing or paused)
- **5s watch-only** for every other authenticated state (plain, instrumental, not_found, unavailable, lookup_failed, idle, non_track, unavailable playback)
- **250ms** local tick only inside `SyncedLyricsPlayer`
- **zero** polls when logged out

**Interpolation** (`lib/lyrics/playbackSync.ts`): while playing, `estimatedProgressMs = progressMs + (now - receivedAtMs)`, clamped to `[0, durationMs]`; while paused, `progressMs` is frozen. Active line is the last index with `startTimeMs <= positionMs` (binary search). Blank/gap lines remain addressable indices and simply render as nothing highlighted. After ~10s without a successful snapshot, interpolation freezes at the last computed position rather than drifting; polling keeps retrying at the normal cadence; the next good snapshot resumes immediately.

**`resolvePollOutcome`** (`lib/spotify/playbackTransition.ts`) maps `{ renderedTrackId, renderedPlaybackStatus }` plus the latest poll result to:

- **update_baseline** — same `trackId`, status `playing` or `paused` in any combination (pause/resume/seek). Publish the snapshot. Never `router.refresh()`.
- **refresh** — `trackId` differs (including `null` → a new id when idle/non_track becomes a track); rendered page vs `idle` / `non_track` / `unavailable` change; `reauth_required`.
- **ignore** — transient `ok: false` (e.g. `spotify_request_failed`). Synced interpolation applies the 10s stale freeze if snapshots stop arriving.

**Refresh-in-flight guard:** `hasRequestedRefreshRef` on `PlaybackMonitor`. The first `refresh` outcome sets the flag, calls `router.refresh()` once, and clears the poll interval. The flag is not cleared if the poll effect re-runs (React Strict Mode in development, or a `pollIntervalMs` change): that would issue a second refresh and abort the still-streaming RSC payload. The monitor is keyed by rendered track id + playback status so the replacement tree starts a fresh loop. Same-track pause/resume/seek never refresh.

Track-change refreshes overlap a long-lived Suspense stream (`TranslationSection` / OpenAI). If the client aborts that stream — including a superseded duplicate refresh — Next.js 16.3 can log `Error: The destination stream closed early` from its RSC pipe. That is a client-aborted stream, not an application throw. Do not swallow it in app code.

**Manual scroll:** auto-follow pauses on a user scroll (programmatic `scrollIntoView` is suppressed via a short window) and stays off until the user taps **Resume following** or the track changes. Highlighting continues while follow is paused. The control is a viewport-fixed, bottom-centered pill (`position: fixed`) so it stays visible after scrolling, with extra lyric-block padding so the last lines can sit above it.

**Suspense / Option A:** the Phase 4 `<Suspense fallback={<TranslationPending/>}><TranslationSection/></Suspense>` boundary is unchanged. `PlaybackMonitor` wraps it, so polling continues during pending translation. Live highlighting does **not** start until translation resolves and `SyncedLyricsPlayer` mounts — accepted product tradeoff rather than hoisting highlight state across the Suspense boundary. During that window original lyrics stay visible but static. When the player mounts it reads the current context snapshot rather than only the stale `Home()` snapshot.

**Plain fallback:** `status === "plain"` still renders `TranslatedLines`. No 250ms tick. `PlaybackMonitor` stays mounted on the 5s watch cadence. Same for instrumental / not_found / unavailable / lookup_failed.

**Display alignment:** `TranslationSection` zips `SyncedLyricLine[]` with `TranslationResult.lines` by array position (already guaranteed 1:1 by `validateAlignment()`) into `DisplayLyricLine` in `app/LyricsDisplay.tsx` — a UI shape, not a service domain type.

## LRCLIB lyric retrieval

The MVP lyric source is LRCLIB. Pipeline: Spotify track metadata → LRCLIB lookup → synchronized lyrics if available → plain lyrics if available → clean not-found state. Do not automatically scrape arbitrary lyric websites as a fallback. The UI consumes Verso-owned lyric types (`lib/lyrics/types.ts`), never raw LRCLIB response shapes.

**Lookup strategy:** a single call to `GET /api/get`, not `/api/search`. `/api/search` returns up to 20 results with no duration filtering, which would require Verso to build its own disambiguation; `/api/get`'s server-enforced duration match (exact, or within ±2 seconds) is the anti-false-match mechanism instead. The accepted tradeoff is real coverage loss — some tracks findable by hand in LRCLIB's search will surface as `not_found`. Adding `/api/search` as a fallback would be a deliberate, separately-evaluated future decision.

Query parameters sent to `/api/get`:

- `track_name` — Spotify's track name, trimmed only. Suffixes like "(feat. ...)", "- Remastered 2011", "(Live)", or "(Acoustic)" are never stripped — LRCLIB stores per-recording titles, so an exact title is safer against cross-version false matches than a "cleaned up" string.
- `artist_name` — the primary (first) Spotify artist only, never a joined multi-artist string. LRCLIB stores one artist string per record.
- `album_name` — Spotify's album name when present, omitted otherwise (recommended, not required).
- `duration` — `Math.round(track.durationMs / 1000)`.

Only `plainLyrics` and the legacy line-synced `syncedLyrics` string are read. LRCLIB's newer `lyricsfile` (YAML) field is deliberately ignored — do not add YAML parsing to consume it without a separate, explicit decision.

`syncedLyrics` is parsed into `SyncedLyricLine[]` (`{ startTimeMs: number; text: string }`) in `lib/lyrics/syncedLyrics.ts`. Trailing timestamp-only lines (empty text) are preserved, not filtered — they are meaningful end-of-song/gap markers that playback-aligned highlighting uses as un-highlighted windows. Non-timestamp metadata lines (e.g. `[au: instrumental]`) are silently skipped. If `syncedLyrics` parses to zero usable lines, the result falls back to `plain` (or `unavailable`) rather than ever returning `synced` with an empty `lines` array.

Some LRCLIB records embed a non-standard Traly/Huawei bilingual suffix on the same line (`original^translation`). That is contributor content, not something Verso's parser invents. After timestamp parse (and per line for `plainLyrics`), Verso keeps the sung original when both sides of the first `^` are non-empty, so the embedded translation is not shown as source text and is not sent to OpenAI. A lone `^` with no text on one side is left unchanged.

`LyricsResult` is a five-state domain type (`lib/lyrics/types.ts`): `synced`, `plain`, `instrumental` (LRCLIB's own explicit flag, never inferred from empty text), `not_found` (a confirmed `404`), and `unavailable` (a record exists but has no usable lyric content — kept distinct from `not_found` even though the UI currently shows the same fallback copy). Request-level failures (network errors, non-404 error statuses, malformed JSON) use a separate `LyricsLookupResult` wrapper with `reason: "lookup_failed"`. LRCLIB requires honoring `429`'s `Retry-After` header if hit; the current one-lookup-per-render behavior does not implement an automatic retry/backoff loop — a `429` simply becomes `lookup_failed`.

A `synced` result's `plainText` is LRCLIB's `plainLyrics` when non-empty, otherwise derived by joining the parsed `SyncedLyricLine[]`'s non-empty text with `\n`. A valid synced match must never be discarded just because `plainLyrics` is unexpectedly null/empty.

LRCLIB is unauthenticated and has none of Spotify's OAuth/session/retry concerns, so `lib/lyrics/lrclib.ts` shares no HTTP abstraction with `lib/spotify`. It requires a `User-Agent` identifying the client; Verso sends `Verso/<package.json version> (<package.json homepage>)`, reading both values from `package.json` (a real `homepage` field pointing at Verso's GitHub repository).

Lyrics lookup is gated strictly by `CurrentPlayback.status` being `playing` or `paused`, evaluated in the same `app/page.tsx` Server Component render used for playback. LRCLIB is not polled; when Spotify's track/content changes, `PlaybackMonitor` triggers `router.refresh()` and Home fetches lyrics again.

## OpenAI translation

OpenAI is used only to translate lyrics already retrieved from LRCLIB — never to generate, retrieve, or invent lyric text. `app/page.tsx` never imports `openai` or touches raw Structured Outputs shapes; it renders Verso-owned `TranslationLookupResult` values from `lib/translation/`.

**API surface:** the Responses API's `client.responses.parse()`, with Structured Outputs (`text.format`) built from a Zod schema via the SDK's `zodTextFormat` helper (`openai/helpers/zod`) — no manual JSON Schema authoring or hand-rolled response parsing.

**Client construction:** `new OpenAI()` throws synchronously if `OPENAI_API_KEY` is empty/missing. The client is therefore constructed lazily inside `lib/translation/openai.ts`'s `translateLyrics()`, only after `OPENAI_API_KEY` and `OPENAI_TRANSLATION_MODEL` are both explicitly validated — never at module scope. Missing/empty config short-circuits to `{ ok: false, reason: "config_error" }` before any client is constructed or network call attempted.

**Domain model** (`lib/translation/types.ts`): `TranslatedLyricLine` (`sourceIndex`, `translatedText`), `TranslationResult` (`sourceLanguage`, `targetLanguage`, `lines`), and `TranslationLookupResult` discriminating `config_error` / `request_failed` / `invalid_response` / `refused` — kept distinct internally (mirroring the Phase 3 `not_found`/`unavailable` precedent) even though the UI shows one generic failure message for all four.

**Line-index alignment invariant:** every source line (synced or plain, blanks included) is sent to the model tagged with its array index, and the model is instructed to return exactly one output line per input line, in the same order, with the same `sourceIndex`, and `translatedText: ""` for blank input lines. The prompt instruction is not what guarantees correctness — `translateLyrics()` independently validates after parsing that the returned array length matches the input length and that `lines[i].sourceIndex === i` for every `i`; any mismatch becomes `invalid_response` rather than trusting the model's self-reported index. This guarantees `TranslatedLyricLine[i]` corresponds to the source line at position `i` by construction, so playback-aligned display can zip a translated line with `SyncedLyricLine.startTimeMs` by array position without re-running translation.

**Source-language metadata:** `sourceLanguage` is a lowercase two-letter (ISO 639-1-shaped) string, format-enforced via Structured Outputs' `pattern` string constraint (part of the supported strict-mode JSON Schema subset, so the model cannot emit a non-matching shape). This is **best-effort model-reported metadata only** — its format is enforced, its semantic correctness is not verified, and translation success never depends on it. Its only consumer is a lightweight "Already in {language}" UX note when it equals the requested target language.

**Target-language strategy:** a small fixed set of supported languages (`lib/translation/languages.ts`, defaulting to English) selected via a stateless `?lang=` query param on `/`, the same `searchParams` pattern already used for `spotify_error`. An unsupported/missing code falls back to the default rather than erroring. No persisted preference yet (Phase 6).

**Execution boundary — Suspense-streamed, not blocking:** `app/page.tsx`'s `Home` awaits profile → playback → lyrics exactly as in Phase 2/3 (all fast, free) and renders track info and original lyrics immediately. Source-line extraction (`extractSourceLines()`, pure/synchronous) happens in `Home` itself so a translation `<Suspense>` boundary — and the OpenAI call inside it — is only ever rendered when there is genuinely translatable content. The actual `translateLyrics()` call lives inside a separate async Server Component (`TranslationSection`) wrapped in `<Suspense>`, so Next.js streams the already-resolved shell first and streams in the translated lines once the OpenAI call resolves, instead of blocking the whole response on it. No client component, no Route Handler, no client-side OpenAI fetching — translation is fully server-side.

**Model/config strategy:** the model is read from `OPENAI_TRANSLATION_MODEL` with no hardcoded fallback (unset → `config_error`); recommended development value is `gpt-5.6-luna`, OpenAI's own guidance for cost-sensitive, high-volume workloads, which matches Phase 4's uncached, one-call-per-render pattern. Request config in `lib/translation/openai.ts`: `reasoning: { effort: "none" }` (GPT-5.6 rejects `"minimal"` outright with a 400; `"none"` is the lowest supported rung and fully disables reasoning for this bounded, schema-constrained task — must use the nested Responses API shape, not the flat Chat Completions `reasoning_effort` field), `text.verbosity: "low"`, and an explicit `max_output_tokens: 6000` (sized for a full song with headroom; costs nothing extra unless actually used, since `reasoning: none` leaves the whole budget available for real content). If a different model is configured, verify it accepts these fields — this is not runtime-validated.

**No caching in Phase 4:** every render with translatable lyrics makes a fresh OpenAI call — a real per-call dollar cost, not just latency, unlike the free Spotify/LRCLIB calls. There is exactly one `translateLyrics()` call site per request (inside the single Suspense-wrapped component), so a request-scoped dedup wrapper (React's `cache()`) would add code with no actual benefit and is deliberately not used. Cross-request reuse would need `"use cache"`/Cache Components (a broader rendering-model opt-in) or persistent storage, and even the default `"use cache"` in-memory handler is documented as ephemeral per serverless instance in production — not reliable enough to solve this without real infrastructure. Proper reusable translation caching, keyed on source lyrics + target language + model, is deferred to **Phase 6** once persistence exists.

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

Implement one phase at a time. For each phase:

1. inspect the current repo
2. plan the smallest meaningful change
3. review the plan
4. implement the approved scope
5. run automated checks
6. perform manual testing
7. report files changed and decisions made
8. stop before the next phase

Do not silently implement future phases.
