export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-sm flex-col gap-10">
        <span className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">
          Verso
        </span>

        <div className="flex flex-col gap-4">
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-50">
            Understand the songs you love.
          </h1>
          <p className="text-base leading-relaxed text-zinc-400">
            Verso connects to Spotify, figures out what you&apos;re currently
            listening to, and shows you the lyrics — translated into the
            language you understand.
          </p>
        </div>

        <ol className="flex flex-col gap-3 text-sm text-zinc-400">
          <li className="flex gap-3">
            <span className="text-zinc-500">1</span>
            <span>Connect your Spotify account.</span>
          </li>
          <li className="flex gap-3">
            <span className="text-zinc-500">2</span>
            <span>Verso detects the song currently playing.</span>
          </li>
          <li className="flex gap-3">
            <span className="text-zinc-500">3</span>
            <span>Read the original lyrics alongside a translation.</span>
          </li>
        </ol>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 text-sm font-medium text-white opacity-60 cursor-not-allowed"
          >
            Connect Spotify
          </button>
          <p className="text-center text-xs text-zinc-500">
            Spotify connection is coming soon.
          </p>
        </div>
      </div>
    </main>
  );
}
