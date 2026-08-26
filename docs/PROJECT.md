# Verso — Project Context

## Product

Verso is a mobile-first lyric translation companion for people who listen to music in languages they do not fully understand.

The core problem is simple: when I am listening to a song in Spanish or another language and want to understand it, I usually have to leave Spotify, search for lyrics, find or generate a translation, and then figure out where I am in the song.

Verso is intended to make that process much easier.

## Core Experience

The intended user flow is:

1. The user is already listening to music in Spotify.

2. The user opens Verso.

3. Verso identifies the currently playing Spotify track.

4. Verso retrieves lyrics for that song.

5. Verso translates those lyrics into the user's selected language.

6. Verso displays the original lyrics and translation together.

7. When synchronized lyrics are available, Verso can eventually follow playback and highlight the current line.

8. When only plain lyrics are available, Verso falls back to a clean static reading experience.

The product should require as little manual input as possible.

## Product Principles

### Mobile first

Verso is being developed as a web application, but the primary intended experience is on a phone.

The responsive web experience should be excellent before PWA functionality is added.

### Keep the original lyrics visible

Translation should not replace the source lyrics.

The user should be able to connect what they hear with the original lyric and immediately see its meaning.

### Graceful degradation

Verso should handle different levels of lyric availability:

- synchronized lyrics

- plain lyrics

- lyrics unavailable

Missing synchronized lyrics should not make the application unusable.

### Translation quality over AI novelty

OpenAI is used to translate retrieved lyrics.

It is not responsible for inventing or retrieving lyric text.

Later features may include slang, idiom, regional-language, or cultural explanations.

## Planned Stack

Core:

- Next.js

- App Router

- React

- TypeScript

- Tailwind CSS

External integrations:

- Spotify Web API

- LRCLIB

- OpenAI API

- Zod

Later:

- PostgreSQL / Supabase

- Drizzle ORM

- PWA support

- Vercel

## Roadmap

### Phase 0 — Foundation

Complete.

- Next.js scaffold

- mobile-first landing shell

- base project configuration

- documentation

- lint/build/typecheck validation

### Phase 1 — Spotify Authentication

Complete.

- Spotify OAuth

- secure session handling

- token refresh lifecycle

- reconnect handling

- minimal authenticated profile state

### Phase 2 — Current Playback

Current phase.

- identify currently playing track

- retrieve playback state and position

- handle paused/no-playback states

### Phase 3 — Lyrics

- retrieve lyrics through LRCLIB

- prefer synchronized lyrics

- fall back to plain lyrics

- clean not-found state

### Phase 4 — Translation

- target language selection

- OpenAI translation

- Structured Outputs

- Zod validation

- original + translation UI

### Phase 5 — Playback-Aligned Lyrics

- highlight current lyric

- interpolate playback position

- periodically re-sync

- intelligent auto-scroll

- non-synced fallback

### Phase 6 — Persistence and Caching

- PostgreSQL / Supabase

- translation caching

- user preferences

- lightweight history as justified by product needs

### Phase 7 — PWA and Production Polish

- installability

- mobile/home-screen experience

- service-worker update behavior

- Vercel deployment

- privacy/data controls