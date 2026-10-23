import { api, ApiError, type CollectionItem, type Printing, type Schemas, type Sku } from './api';

type Page<T> = { data: T[]; page: { next_cursor: string | null } };

const setPrintings = new Map<string, Schemas['CatalogPrinting'][]>();

// shortcut: nexustcg has no lookup by set code + collector number, so we page through the set once
// and keep it in memory; replace with that endpoint once it exists (see docs/api-gaps.md).
async function printingsOf(setCode: string): Promise<Schemas['CatalogPrinting'][]> {
  const key = setCode.toLowerCase();
  const cached = setPrintings.get(key);
  if (cached) return cached;
  const set = await api<Schemas['CatalogSet']>(`/catalog/games/mtg/sets/${encodeURIComponent(key)}`);
  const all: Schemas['CatalogPrinting'][] = [];
  let cursor: string | null = null;
  do {
    const query: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const page: Page<Schemas['CatalogPrinting']> = await api(`/catalog/sets/${set.id}/printings?limit=100${query}`);
    all.push(...page.data);
    cursor = page.page.next_cursor;
  } while (cursor);
  setPrintings.set(key, all);
  return all;
}

/** The printing with this set code and collector number, with its SKUs. */
export async function findPrinting(setCode: string, collectorNumber: string): Promise<Printing> {
  const wanted = collectorNumber.trim().toLowerCase().replace(/^0+(?=\d)/, '');
  const printing = (await printingsOf(setCode.trim())).find((p) => p.collector_number?.toLowerCase() === wanted);
  if (!printing) throw new ApiError(404, 'ERR_NOT_FOUND', `No card ${collectorNumber} in ${setCode.toUpperCase()}`);
  return api<Printing>(`/catalog/printings/${printing.id}`);
}

export interface Preferences {
  condition: number;
  finish: string;
  language: string;
}

/** The single SKU closest to the preferred finish and language. */
export function pickSku(skus: Sku[], prefs: Pick<Preferences, 'finish' | 'language'>): Sku | null {
  const singles = skus.filter((sku) => sku.category === 'single' && sku.is_active);
  return (
    singles.find((s) => s.finish === prefs.finish && s.language === prefs.language) ??
    singles.find((s) => s.language === prefs.language) ??
    singles.find((s) => s.finish === prefs.finish) ??
    singles[0] ??
    null
  );
}

export const conditions = () =>
  api<{ data: Schemas['CatalogReferenceItem'][] }>('/catalog/reference/conditions').then((r) =>
    r.data.filter((c) => c.scale === 'card'),
  );

export const addToCollection = (skuId: string, condition: number) =>
  api<CollectionItem>('/collection/items', {
    method: 'POST',
    body: JSON.stringify({ sku_id: skuId, condition, quantity: 1 }),
  });

/** Takes back one added copy: archives a new item, or lowers the count of the stack it joined. */
export async function undoAdd(added: CollectionItem): Promise<unknown> {
  // Later scans may have joined the same stack, so act on its current count and version.
  const item = await api<CollectionItem>(`/collection/items/${added.id}`);
  if (item.total_quantity <= 1) {
    return api(`/collection/items/${item.id}?version=${item.version}`, { method: 'DELETE' });
  }
  return api(`/collection/items/${item.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ version: item.version, total_quantity: item.total_quantity - 1 }),
  });
}
