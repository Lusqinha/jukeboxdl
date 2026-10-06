import { z } from "zod";

export const LOCALES = ["pt-BR", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** Idioma pelo ambiente: JUKEBOXDL_LANG, depois LC_ALL/LC_MESSAGES/LANG, depois o Intl. */
export function detectLocale(env: NodeJS.ProcessEnv = process.env): Locale {
  const lang =
    env.JUKEBOXDL_LANG ||
    env.LC_ALL ||
    env.LC_MESSAGES ||
    env.LANG ||
    Intl.DateTimeFormat().resolvedOptions().locale;
  return /^pt/i.test(lang) ? "pt-BR" : "en";
}

let current: Locale = detectLocale();

export function getLocale(): Locale {
  return current;
}

/** Troca o idioma das mensagens (inclusive as de validação do Zod). */
export function setLocale(locale: Locale): void {
  current = locale;
  z.config(locale === "en" ? z.locales.en() : z.locales.ptBR());
}

setLocale(current);

export type Params = Record<string, string | number>;

/**
 * Interpola `{nome}` e plurais `{n|singular|plural}`. Chaves sem parâmetro ficam como estão,
 * o que permite mensagens com chaves literais, como `{title}` em textos sobre templates.
 */
export function format(message: string, params?: Params): string {
  if (!params) return message;
  return message
    .replace(/\{(\w+)\|([^|}]*)\|([^}]*)\}/g, (match, key: string, one: string, other: string) =>
      key in params ? (Number(params[key]) === 1 ? one : other) : match,
    )
    .replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? String(params[key]) : match));
}

/** Cria um tradutor a partir de dicionários; o inglês precisa ter as mesmas chaves do pt-BR. */
export function defineMessages<T extends Record<string, string>>(dictionaries: {
  "pt-BR": T;
  en: Record<keyof T, string>;
}) {
  return (key: keyof T, params?: Params): string =>
    format(dictionaries[current][key] as string, params);
}
