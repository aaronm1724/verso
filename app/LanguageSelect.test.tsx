import type { ChangeEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { SupportedLanguage } from "@/lib/translation/languages";

import { LanguageSelect } from "./LanguageSelect";

const languages: SupportedLanguage[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
];

describe("LanguageSelect", () => {
  it("renders every supported language as an option", () => {
    const html = renderToStaticMarkup(<LanguageSelect languages={languages} defaultValue="en" />);

    expect(html).toContain("English");
    expect(html).toContain("Spanish");
    expect(html).toContain("French");
  });

  it("renders the current target language as the selected option", () => {
    const html = renderToStaticMarkup(<LanguageSelect languages={languages} defaultValue="es" />);

    const spanishOption = html.match(/<option[^>]*value="es"[^>]*>/)?.[0];
    expect(spanishOption).toContain("selected");
  });

  it("renders no submit/Go button — the select is the only control", () => {
    const html = renderToStaticMarkup(<LanguageSelect languages={languages} defaultValue="en" />);

    expect(html).not.toContain("<button");
    expect(html).not.toContain("Go");
  });

  it("submits the enclosing form when the selection changes", () => {
    const element = LanguageSelect({ languages, defaultValue: "en" });
    const requestSubmit = vi.fn();

    element.props.onChange({
      currentTarget: { form: { requestSubmit } },
    } as unknown as ChangeEvent<HTMLSelectElement>);

    expect(requestSubmit).toHaveBeenCalledTimes(1);
  });
});
