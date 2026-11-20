# tradeable. app

The tradeable. companion app for iOS and Android: scan a card's set code and collector number and add it to your collection (backlog task APP-01a in [nexustcg](https://github.com/Unbuckle/nexustcg)).

Built with Expo (React Native, SDK 58). It talks only to the tradeable. API (`/api/v1`).

## What it does

- Sign in with email and password, plus the authenticator code when two-step sign-in is on. Tokens are kept in the device's secure storage.
- App frame: a slim bottom bar with icons only (Marketplace, Collection, a raised green Scan button, Community, Sell), the account top left (handle, email, sign out) and settings top right. Marketplace, Community and Sell say "coming later".
- Collection: your folders with their counts, and an Unsorted row for scanned cards waiting. Unsorted lists them; pick some (or all) and move them into a folder (up to 100 at a time).
- Scan: the camera fills the screen. Each time you open it, choose where the batch goes (Unsorted, the last used folder, or another folder); "To … ›" changes it. Hold a card in view: the app takes a photo about every second and reads it on the device (Google ML Kit) for the set code, number, language and foil star. Once two photos agree it sends that photo (shrunk to 1600 px, under 700 KiB) with the collector line to `POST /api/v1/recognitions`, which finds the card in the photo.
  - Normal mode: the best match slides up with its picture, set and number, rarity and market price; pick finish, condition, language and quantity, or tap one of the two other candidates; one tap adds it. "Not right? Search by name" finds it by name instead.
  - Lightning mode: the best match is added at once, with a small "Added … Wrong?" note; Wrong? takes it back and opens the choice.
  - "N scanned" lists this session's cards with Undo.
- Settings: scanner mode, language, condition, prefer foil (foil whenever the printing comes in foil; the ★ on the card always means foil), ignore promos (sent to the server), and where new batches go (ask each time, Unsorted or a folder). Kept on the phone.

## Run it

Needs Node 22 or later.

```bash
npm install
npm start          # Expo Go: no on-device reading, so the scanner shows a Take photo button
```

Camera scanning uses native code (ML Kit), which Expo Go does not include. It needs a development build:

```bash
npx eas-cli@latest login                                     # free Expo account
npx eas-cli@latest build --profile development --platform android
# install the APK from the link EAS prints, then:
npm run start:dev
```

The app talks to the dev environment by default. To use another server, set `EXPO_PUBLIC_API_URL` (for example in `.env.local`).

## Checks

```bash
npm run typecheck
npm run lint
npm test           # collector-line parser, card reader, scan rules
```

There is no CI yet: GitHub-hosted minutes are used up until November. Run the checks before each PR.

## API types

`src/api-schema.ts` is generated from `api/openapi.v1.yaml`, a copy of nexustcg's `docs/api/openapi.v1.yaml` at the commit in `api/openapi.commit`. To update, copy the file again, write the new commit, and run `npm run api:types`. A breaking API change then shows up as a type error.

## Open API gaps

See [docs/api-gaps.md](docs/api-gaps.md).
