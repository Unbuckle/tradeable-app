/** Pure rules of the scan flow, kept free of React Native so `node --test` can run them. */

export interface ScanSettings {
  mode: 'lightning' | 'normal';
  /** Catalog language code; a different language read on the card wins. */
  language: string;
  /** Condition id from `/catalog/reference/conditions`. */
  condition: number;
  /** Foil whenever the printing comes in foil; the ★ on the card forces foil either way. */
  preferFoil: boolean;
  /** Sent to the server as `ignore_promos`. */
  ignorePromos: boolean;
  /** Where every new batch goes: a folder id, `unfiled` (Unsorted), or null to ask each time. */
  batchTarget: string | null;
}

export const defaultSettings: ScanSettings = {
  mode: 'normal',
  language: 'en',
  condition: 1,
  preferFoil: false,
  ignorePromos: false,
  batchTarget: null,
};

interface SkuLike {
  id: string;
  category: string;
  is_active: boolean;
  finish: string | null;
  language: string;
}

/** The finish to add: foil when the card shows the ★, or when foil is preferred and the printing has a foil SKU. */
export function wantedFinish(skus: SkuLike[], preferFoil: boolean, foilMark: boolean | null): string {
  if (foilMark) return 'foil';
  const hasFoil = skus.some((s) => s.category === 'single' && s.is_active && s.finish === 'foil');
  return preferFoil && hasFoil ? 'foil' : 'nonfoil';
}

/** The single SKU closest to the wanted finish and language. */
export function pickSku<T extends SkuLike>(skus: T[], wanted: { finish: string; language: string }): T | null {
  const singles = skus.filter((sku) => sku.category === 'single' && sku.is_active);
  const finishOf = (s: T) => s.finish ?? 'nonfoil';
  return (
    singles.find((s) => finishOf(s) === wanted.finish && s.language === wanted.language) ??
    singles.find((s) => s.language === wanted.language) ??
    singles.find((s) => finishOf(s) === wanted.finish) ??
    singles[0] ??
    null
  );
}

/** The defaults pill on the scanner, e.g. "EN · NM · foil · no promos". */
export function defaultsSummary(settings: ScanSettings, conditionCode: string | undefined): string {
  return [
    settings.language.toUpperCase(),
    conditionCode,
    settings.preferFoil ? 'foil' : null,
    settings.ignorePromos ? 'no promos' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The size to shrink a photo to so its long side is at most `max` pixels; never enlarges. */
export function fitLongSide(width: number, height: number, max = 1600): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Bytes encoded in a base64 string (without data: prefix). */
export const base64Bytes = (base64: string) =>
  Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
