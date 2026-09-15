"use client";

import type { SupportedLanguage } from "@/lib/translation/languages";

type Props = {
  languages: SupportedLanguage[];
  defaultValue: string;
};

// Translation is automatic, not gated behind a submit button — this only
// needs enough client interactivity to auto-submit the existing
// server-rendered GET <form> on change. That form still owns the actual
// `?lang=` navigation, so this stays a normal full navigation (no client
// state, no client-side OpenAI call, no Route Handler).
export function LanguageSelect({ languages, defaultValue }: Props) {
  return (
    <select
      id="lang"
      name="lang"
      defaultValue={defaultValue}
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
      className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
    >
      {languages.map((language) => (
        <option key={language.code} value={language.code}>
          {language.label}
        </option>
      ))}
    </select>
  );
}
