# Verso

A mobile-first companion for listening to music in languages you don't fully understand.

## What it does

Connect Spotify, and Verso follows the song that is already playing. It loads the lyrics, translates them into the language you select, and shows the original and the translation together.

When the lyrics include timestamps, Verso highlights the current line and scrolls with playback. A manual scroll pauses that follow until you choose Resume following. Plain lyrics stay a static reading view, and Verso still watches Spotify for the next track.

Spotify does not provide lyrics. Verso looks them up on LRCLIB and translates only text it actually retrieved.

## How it fits together

```text
Spotify Web API
→ current track and playback position
→ LRCLIB lyrics
→ OpenAI translation, reused from Postgres when the same lyrics and language were already translated
→ original and translation, highlighted against playback when timestamps exist
```

Successful translations are cached. Lyrics, playback, and failed lookups are not. Language choice is a `lang` query parameter, remembered in a cookie.

Product context is in [docs/PROJECT.md](docs/PROJECT.md). Technical decisions are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Running locally

Requires Node.js 20+ and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Spotify's local redirect only works on that host, not `localhost`.

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

`npm run db:migrate` applies the translation-cache schema. It reads `DATABASE_URL_DIRECT` and does not run on application startup.

## Environment

Copy `.env.example` to `.env.local` and fill in real values there. `.env.local` is git-ignored. `.env.example` contains names only.

## Deploying to Vercel

1. Import the repository in Vercel.
2. Add every variable from `.env.example` except `DATABASE_URL_DIRECT`. Set `SPOTIFY_REDIRECT_URI` to `https://<domain>/api/auth/callback/spotify`, and use the Supabase transaction pooler (port 6543) for `DATABASE_URL`.
3. Add the same redirect URI in the Spotify developer dashboard.
4. Run `npm run db:migrate` locally before the first deploy.
5. Pick a function region near your Supabase region. The home page requests `maxDuration = 60`, so confirm your Vercel plan allows it.

Open the deployed URL on a phone and use Add to Home Screen to install Verso.

## Later

Listening-screen polish after real-phone testing, and listening history.
