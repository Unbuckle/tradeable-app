# API gaps in nexustcg

What the app needs from the nexustcg API that does not exist yet, and how the app works around it today. Each workaround is marked `shortcut:` in the code.

## 1. Session tokens for native clients

`POST /api/v1/identity/sessions` and `POST /api/v1/identity/sessions/refresh` hand out the access and refresh tokens only as cookies (ADR-125). The refresh endpoint reads the refresh token only from the `nx_rt` cookie.

- **Workaround** (`src/api.ts`): the app reads `nx_at` and `nx_rt` from the `Set-Cookie` header, keeps them in secure storage, sends `Authorization: Bearer <access token>` (so no CSRF header is needed) and sends `Cookie: nx_rt=...` itself to refresh or sign out.
- **Wanted**: a native-client variant of sign-in and refresh that returns the tokens in the response body and takes the refresh token in the body.

## 2. Find a printing by set code and collector number

There is no lookup from a set code and collector number to a printing.

- **Workaround** (`src/catalog.ts`): `GET /catalog/games/mtg/sets/{set_code}` for the set id, then every page of `GET /catalog/sets/{set_id}/printings` (up to five requests for a large set), cached in memory per set.
- **Wanted**: `GET /api/v1/catalog/games/{game_code}/sets/{set_code}/printings/{collector_number}` returning the printing with its SKUs.

## 3. Picture recognition: printings and `ignore_promos`

The scanner sends each photo to `POST /api/v1/recognitions`. The answer holds only printing ids, so the app fetches each candidate with `GET /catalog/printings/{id}` (up to three more requests per scan, run in parallel).

- **Wanted**: the candidates with their printing (name, set, number, rarity, pictures and SKUs) in the recognition answer.
- `ignore_promos` is added by nexustcg PR #614, not merged when this was written. The copied OpenAPI file (`api/openapi.commit`) predates it, so `src/catalog.ts` adds the field to the request type itself (`shortcut:`). Drop that once the OpenAPI copy includes it. Until the server has it, it ignores the field.
- When the server finds nothing but the phone read a set code and number, the app still looks the printing up by those (gap 2).

## 4. Price of one printing

The printing detail carries no price. The result sheet calls `GET /portfolio/market/printing-prices?product_id=…` (every printing of the card) and takes the one it shows. The answer has no currency, so the app shows euros (`shortcut:`), and it shows no price when that market data is switched off.

- **Wanted**: the market price with its currency on `GET /catalog/printings/{id}`, or on the recognition candidates.

## 5. Unsorted list

`GET /collection/items?folder=unfiled` is read once with `limit=100`; the sort screen shows that first page only (`shortcut:` in `src/catalog.ts`). Moving uses `POST /collection/items/move` (up to 100). No gap in the API, only paging left to do in the app.
