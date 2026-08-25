# Verso

A mobile-first companion for listening to music in languages you don't fully
understand.

## Why I built it

I listen to a lot of music in languages I don't fully understand. Getting a
useful translation while listening usually means leaving Spotify, finding the
lyrics somewhere else, finding or generating a translation, and then figuring
out where you actually are in the song. Verso is meant to collapse that into
one step.

## What it does

The intended core flow:

- Connect Spotify.
- Detect the currently playing song.
- Retrieve its lyrics.
- Translate them into your language.
- Show the original and translated lyrics together.
- Eventually, follow along with synced lyrics when timestamps are available.

Right now, only the landing shell exists. None of the above is implemented
yet — see [Current status](#current-status).

## How it works

```text
Spotify Web API
→ current track metadata
→ LRCLIB lyrics
→ OpenAI translation
→ Verso UI
```

Spotify identifies the track and playback state, but its public Web API
doesn't expose lyrics. LRCLIB is the lyric source, and OpenAI only
translates lyrics that were actually retrieved — it never invents them.

## Tech

- Next.js (App Router)
- React
- TypeScript
- Tailwind CSS

Planned, added only when a phase needs them: Spotify Web API, LRCLIB, OpenAI
API, Zod, PostgreSQL/Supabase, Drizzle ORM, PWA/service worker support,
Vercel deployment.

## Current status

Phase 0 is complete: a Next.js scaffold, a static mobile-first landing shell,
and this project documentation. The "Connect Spotify" button on the landing
page is intentionally inert.

Not implemented yet: Spotify authentication, lyric retrieval, translation,
persistence, and PWA support.

## Running locally

Requires Node.js 20+ and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run lint       # ESLint
npm run typecheck  # TypeScript, no emit
npm run build      # Production build
npm run start      # Serve the production build
```

## Environment variables

Copy `.env.example` to `.env.local` and fill in real values only once a
phase actually needs them. `.env.local` is git-ignored; `.env.example` has
no real secrets and is safe to commit.

```bash
cp .env.example .env.local
```

## Roadmap

- **Phase 0 — Foundation** (current): Next.js scaffold, landing shell.
- **Phase 1 — Spotify auth:** login, OAuth callback, token/session handling,
  refresh, reconnect state.
- **Phase 2 — Current playback:** show the track, artist, art, and playback
  state.
- **Phase 3 — Lyrics:** query LRCLIB, prefer synced lyrics, fall back to
  plain lyrics or a clean not-found state.
- **Phase 4 — Translation:** target-language selection, OpenAI Structured
  Outputs + Zod validation, original + translation side by side.
- **Phase 5 — Playback-aligned lyrics:** synced highlighting and
  auto-scroll.
- **Phase 6 — Persistence:** PostgreSQL/Supabase, translation caching,
  lightweight preferences.
- **Phase 7 — PWA and polish:** installability, icons, service-worker
  update behavior, Vercel deployment.
