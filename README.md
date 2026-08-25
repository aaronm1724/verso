# Verso

Verso is a mobile-first lyric translation companion for music listeners who
regularly listen to songs in languages they do not fully understand.

## The problem

Loving a song in a language you don't speak usually means leaving Spotify,
searching for lyrics, finding a translation, and manually figuring out where
you are in the song. Verso is meant to make that nearly frictionless.

## Planned high-level workflow

1. The user is already playing music in Spotify.
2. The user opens Verso.
3. Verso identifies the currently playing Spotify track.
4. Verso retrieves lyrics for that track from LRCLIB.
5. Verso translates the lyrics into the user's chosen target language.
6. Verso displays the original and translated lyrics together.
7. When timestamped lyrics are available, Verso highlights and scrolls
   lyrics roughly in sync with playback. Otherwise it falls back to a clean,
   non-synchronized reading experience.

Spotify's public Web API identifies what's playing but does not provide
lyrics — LRCLIB is the lyric source, and OpenAI is used only to translate
lyrics that have already been retrieved, never to invent them.

## Technology stack

- Next.js (App Router)
- React
- TypeScript
- Tailwind CSS
- Next.js server route handlers for server-side API logic

Introduced in later phases only when needed: Spotify Web API, LRCLIB,
OpenAI API, Zod, PostgreSQL/Supabase, Drizzle ORM, PWA/service worker
support, Vercel deployment.

## Current development status

**Phase 0 — Foundation.** The project is a scaffolded Next.js application
with a static, mobile-first landing shell. There is no Spotify
authentication, no lyric retrieval, no translation, and no persistence yet.
The "Connect Spotify" button on the landing page is intentionally inert.

## Local development

Requires Node.js 20+ and npm.

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

Other scripts:

```bash
npm run lint        # ESLint
npm run typecheck    # TypeScript, no emit
npm run build        # Production build
npm run start        # Serve the production build
```

## Environment variables

Copy `.env.example` to `.env.local` and fill in real values only once a
phase actually requires them. `.env.local` is git-ignored; `.env.example`
contains no real secrets and is safe to commit.

```bash
cp .env.example .env.local
```

## Roadmap

- **Phase 0 — Foundation** (current): Next.js scaffold, landing shell.
- **Phase 1 — Spotify authentication:** login, OAuth callback, token/session
  handling, refresh lifecycle, reconnect state.
- **Phase 2 — Current playback:** retrieve and display the currently
  playing track and playback state.
- **Phase 3 — Lyrics:** query LRCLIB, prefer synced lyrics, fall back to
  plain lyrics or a clean not-found state.
- **Phase 4 — Translation:** target-language selection, OpenAI Structured
  Outputs, Zod validation, original + translation displayed together.
- **Phase 5 — Playback-aligned lyrics:** synchronized highlighting and
  auto-scroll using timestamped lyrics.
- **Phase 6 — Persistence and caching:** PostgreSQL/Supabase, translation
  caching, lightweight user preferences.
- **Phase 7 — PWA and production polish:** installability, icons, deliberate
  service-worker update behavior, Vercel deployment.
