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

## 3. Picture recognition

`POST /api/v1/recognitions` (SCAN-01) exists but always answers "no match" until SCAN-00 picks a model. The app does not call it yet; cards without a readable collector line (before 2014) need the set code typed in.
