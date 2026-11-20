import { api, ApiError, type CollectionItem, type Printing, type Schemas } from './api';

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

export const conditions = () =>
  api<{ data: Schemas['CatalogReferenceItem'][] }>('/catalog/reference/conditions').then((r) =>
    r.data.filter((c) => c.scale === 'card'),
  );

export const addToCollection = (skuId: string, condition: number, folderId: string | null, quantity = 1) =>
  api<CollectionItem>('/collection/items', {
    method: 'POST',
    body: JSON.stringify({ sku_id: skuId, condition, quantity, folder_id: folderId }),
  });

export const folders = () =>
  api<{ items: Schemas['CollectionFolder'][] }>('/collection/folders').then((r) => r.items);

/** Single cards whose name matches, for cards whose collector line can't be read. */
export const searchCards = (name: string) =>
  api<Schemas['SearchResponse']>(`/search?scope=catalog&limit=10&q=${encodeURIComponent(name.trim())}`).then((r) =>
    r.results.catalog.filter((hit) => hit.category === 'single'),
  );

/** Every printing of a card with its SKUs, newest set first. */
export const printingsOfCard = (productId: string) =>
  api<{ data: Printing[] }>(`/catalog/products/${productId}/printings`).then((r) => r.data.reverse());

/** Takes back the added copies: archives a new item, or lowers the count of the stack it joined. */
export async function undoAdd(added: CollectionItem, quantity = 1): Promise<unknown> {
  // Later scans may have joined the same stack, so act on its current count and version.
  const item = await api<CollectionItem>(`/collection/items/${added.id}`);
  if (item.total_quantity <= quantity) {
    return api(`/collection/items/${item.id}?version=${item.version}`, { method: 'DELETE' });
  }
  return api(`/collection/items/${item.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ version: item.version, total_quantity: item.total_quantity - quantity }),
  });
}

/** One printing with its SKUs. */
export const printingById = (id: string) => api<Printing>(`/catalog/printings/${id}`);

export interface Candidate {
  printing: Printing;
  confidence: number;
}

// shortcut: `ignore_promos` is in nexustcg PR #614, not yet in the copied OpenAPI file; drop this type once it is.
type RecognizeRequest = Schemas['RecognizeCardRequest'] & { ignore_promos?: boolean };

/** Up to three printings the photo most likely shows, best first; empty when nothing matches. */
export async function recognizePhoto(request: RecognizeRequest): Promise<Candidate[]> {
  const { candidates } = await api<Schemas['CardRecognition']>('/recognitions', {
    method: 'POST',
    body: JSON.stringify(request),
  });
  return Promise.all(
    candidates.slice(0, 3).map(async (c) => ({ printing: await printingById(c.printing_id), confidence: c.confidence })),
  );
}

/** Market price of a printing in cents (lowest over its languages and finishes), or null. */
export const marketPrice = (printing: Printing) =>
  api<{ data: Schemas['PrintingPrice'][] }>(`/portfolio/market/printing-prices?product_id=${printing.product_id}`).then(
    (r) => r.data.find((p) => p.printing_id === printing.id)?.market_cents ?? null,
    () => null, // prices are a nice-to-have; the market data may be switched off
  );

type ItemPage = { data: CollectionItem[]; page: { next_cursor: string | null; total?: number } };

// shortcut: shows the first 100 unfiled items only; page with `cursor` once people scan more before sorting.
export const unfiledItems = () => api<ItemPage>('/collection/items?folder=unfiled&limit=100').then((r) => r.data);

export const unfiledCount = () =>
  api<ItemPage>('/collection/items?folder=unfiled&limit=100').then((r) => r.page.total ?? r.data.length);

/** Moves up to 100 items into a folder (null: unfiled). */
export const moveItems = (itemIds: string[], folderId: string | null) =>
  api('/collection/items/move', { method: 'POST', body: JSON.stringify({ item_ids: itemIds, folder_id: folderId }) });

export const myAccount = () => api<Schemas['Account']>('/identity/me');
