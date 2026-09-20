import type { Locale } from "./config";
import type { Dictionary } from "./dictionary";
import { ar } from "./dictionaries/ar";
import { en } from "./dictionaries/en";

export * from "./config";
export * from "./format";
export { getLocale } from "./get-locale";
export type { Dictionary };

const dictionaries: Record<Locale, Dictionary> = { ar, en };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
