import { type CollectorLine, parseCollectorLine } from './collector-line.ts';

/** One line of text found on the photo, with its position in pixels. */
export interface OcrLine {
  text: string;
  top: number;
  left: number;
}

/** What one photo of a whole card tells us. */
export interface CardRead extends CollectorLine {
  /** The card's name, read from its title line; the fallback for cards without a set code. */
  name: string | null;
}

// A title is words only: letters, spaces, apostrophes, commas and hyphens (mana symbols are not read as text).
const TITLE = /^[\p{L}][\p{L}' ,-]{2,}$/u;

/** Reads the title (topmost line of words) and the collector line from the text of a photo of a whole card. */
export function readCard(lines: OcrLine[]): CardRead {
  const sorted = [...lines].sort((a, b) => a.top - b.top || a.left - b.left);
  const title = sorted.map((l) => l.text.trim().replace(/[^\p{L}]+$/u, '')).find((t) => TITLE.test(t));
  // Only the bottom of the card holds the collector line; card names like "Elves" would otherwise read as set "ELV" + "ES".
  const first = sorted[0]?.top ?? 0;
  const last = sorted.at(-1)?.top ?? 0;
  const bottom = sorted.filter((l) => l.top >= first + 0.75 * (last - first));
  return { ...parseCollectorLine(bottom.map((l) => l.text).join('\n')), name: title ?? null };
}

