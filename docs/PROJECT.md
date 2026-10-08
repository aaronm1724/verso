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

7. When synchronized lyrics are available, Verso follows playback, highlights the current line, and auto-scrolls, with an explicit Resume following control after a manual scroll.

8. When only plain lyrics are available, Verso falls back to a clean static reading experience while still watching Spotify for the next track.

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

## Stack

- Next.js App Router, React, TypeScript, Tailwind CSS
- Spotify Web API for sign-in and current playback
- LRCLIB for lyrics
- OpenAI for translation, validated with Zod
- Supabase-hosted PostgreSQL through Drizzle, for translation caching only

## Current capabilities

- Spotify sign-in, server-only tokens, refresh, and reconnect
- Current track, playback position, and paused or idle states
- LRCLIB lyrics, preferring synchronized lines and falling back to plain text or a clean unavailable state
- Target language chosen with `?lang=`
- Original lyrics shown immediately, with the translation streamed in afterward
- Line-by-line alignment between the original and the translation
- Playback-aligned highlighting and auto-scroll for synchronized lyrics, with Resume following after a manual scroll
- A static reading view for plain lyrics, while Spotify is still watched for the next track
- Durable cache of successful translations, shared across visits and server restarts

The cache is keyed by lyric text, title and artist, target language, model, and cache version. It does not store lyrics, playback, failures, or user identity.

## Later

- Installable app and service-worker updates
- Production deployment
- A saved language preference
- Listening history

Language selection stays on `?lang=` until a saved preference exists.