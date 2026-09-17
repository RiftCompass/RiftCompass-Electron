import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { en } from "./messages/en";
import { es } from "./messages/es";
import { fr } from "./messages/fr";
import { de } from "./messages/de";

// A small hand-rolled i18n layer — this app has no server-rendering to
// worry about (unlike next-intl on the web app), just a locale persisted
// via main/settings.ts and changeable at runtime, so a plain React context
// covers it without a new dependency. `en` is the canonical shape every
// other locale's message file is checked against (see messages/es.ts etc.,
// each typed `: Messages`), which catches a missing/misspelled key at
// compile time instead of silently falling back to English for one string.
export type Messages = typeof en;
export type MessageKey = string;

export const SUPPORTED_LOCALES = ["en", "es", "fr", "de"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_LABEL: Record<Locale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
};

function resolve(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), obj);
}

// The one level of ICU the catalogs use, copied from the web's messages:
// `{name, plural, =0 {…} one {…} other {…}}` with `#` for the number; then
// plain `{var}`. Category by Intl.PluralRules, exact `=n` first, `other`
// last. No nesting: the web doesn't nest either, and a full ICU parser
// for "1 game / 2 games" would be the heaviest module in the renderer.
const PLURAL = /\{(\w+),\s*plural,\s*((?:[^{}]|\{[^{}]*\})*)\}/g;
const BRANCH = /(=\d+|zero|one|two|few|many|other)\s*\{([^{}]*)\}/g;

export function interpolate(template: string, vars: Record<string, string | number> | undefined, locale: string): string {
  const withPlurals = template.replace(PLURAL, (match, key: string, body: string) => {
    const raw = vars?.[key];
    const n = typeof raw === "number" ? raw : Number(raw);
    if (raw === undefined || Number.isNaN(n)) return match;
    const branches = new Map<string, string>();
    for (const m of body.matchAll(BRANCH)) branches.set(m[1], m[2]);
    const category = new Intl.PluralRules(locale).select(n);
    const text = branches.get(`=${n}`) ?? branches.get(category) ?? branches.get("other") ?? "";
    return text.replace(/#/g, new Intl.NumberFormat(locale).format(n));
  });
  if (!vars) return withPlurals;
  return withPlurals.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

// Loaded eagerly (all 4 are small JSON-shaped modules) rather than lazily —
// simpler than a dynamic import for a catalog this size, and switching
// language should feel instant, not trigger a network/chunk fetch.
const CATALOGS: Record<Locale, Messages> = { en, es, fr, de };

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    window.riftcompass.getSettings().then((s) => {
      if (SUPPORTED_LOCALES.includes(s.locale as Locale)) setLocaleState(s.locale as Locale);
    });
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    window.riftcompass.setLocale(next);
  }, []);

  // Screen readers and Chromium's spell checker read the document language
  // from <html lang>, which index.html can only hard-code (round 30).
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => {
      const value = resolve(CATALOGS[locale], key) ?? resolve(CATALOGS.en, key);
      if (typeof value !== "string") return key;
      return interpolate(value, vars, locale);
    },
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export function useT() {
  return useI18n().t;
}
