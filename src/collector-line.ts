/** What the printed collector line of a Magic card tells us. */
export interface CollectorLine {
  setCode: string | null;
  collectorNumber: string | null;
  /** Catalog language code, e.g. `en` or `zh-hans`. */
  language: string | null;
  /** The star between set code and language marks a foil card; the dot a non-foil one. */
  foil: boolean | null;
}

/** Printed language codes to catalog language codes (nexustcg mtgjson/mapping.ts). */
const LANGUAGES: Readonly<Record<string, string>> = {
  EN: 'en',
  DE: 'de',
  FR: 'fr',
  IT: 'it',
  ES: 'es',
  SP: 'es',
  PT: 'pt',
  JA: 'ja',
  JP: 'ja',
  KO: 'ko',
  KR: 'ko',
  RU: 'ru',
  CS: 'zh-hans',
  ZHS: 'zh-hans',
  CT: 'zh-hant',
  ZHT: 'zh-hant',
  PH: 'ph',
};

const SET_AND_LANGUAGE = new RegExp(
  String.raw`\b([A-Z0-9]{3,5})\s*([•·.*★☆✩✪])?\s*(${Object.keys(LANGUAGES).join('|')})\b`,
);
// "123/274 R" (2014-2022) or "0123 R" (2023+): a number followed by the rarity letter.
const NUMBER_WITH_RARITY = /\b(\d{1,4}[a-z]?)(?:\s*\/\s*\d{1,4})?\s+[CURMLSTP]\b/;
const NUMBER_OVER_TOTAL = /\b(\d{1,4}[a-z]?)\s*\/\s*\d{1,4}\b/;

/**
 * Reads the set code, collector number, language and foil mark from OCR text of a card.
 * Cards printed before 2014 carry no set code there; for those `setCode` stays null.
 */
export function parseCollectorLine(text: string): CollectorLine {
  // OCR often reads the letter O as a zero in numbers; only fix it next to digits.
  const clean = text.replace(/(?<=\d)O|O(?=\d)/g, '0');
  const set = SET_AND_LANGUAGE.exec(clean.toUpperCase());
  const number = NUMBER_WITH_RARITY.exec(clean) ?? NUMBER_OVER_TOTAL.exec(clean);
  return {
    setCode: set ? set[1] : null,
    collectorNumber: number ? number[1].replace(/^0+(?=\d)/, '') : null,
    language: set ? LANGUAGES[set[3]] : null,
    foil: set?.[2] ? /[★☆✩✪*]/.test(set[2]) : null,
  };
}
