# tradeable. app

The tradeable. companion app for iOS and Android: scan a card's set code and collector number and add it to your collection (backlog task APP-01a in [nexustcg](https://github.com/Unbuckle/nexustcg)).

Built with Expo (React Native, SDK 58). It talks only to the tradeable. API (`/api/v1`).

## What it does

- Sign in with email and password, plus the authenticator code when two-step sign-in is on. Tokens are kept in the device's secure storage.
- Scan: take a photo of the card's bottom-left corner; on-device text recognition (Google ML Kit) reads the set code, collector number, language and the foil star. Or type the set code and number.
- Shows the card with its picture. Pick finish and language (the card's SKUs) and condition; they stay set between scans. One tap adds it to your collection.
- A list of the cards added this session, with a running count and one-tap undo.

## Run it

Needs Node 22 or later.

```bash
npm install
npm start          # Expo Go: everything except camera scanning
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
npm test           # collector-line parser
```

There is no CI yet: GitHub-hosted minutes are used up until November. Run the checks before each PR.

## API types

`src/api-schema.ts` is generated from `api/openapi.v1.yaml`, a copy of nexustcg's `docs/api/openapi.v1.yaml` at the commit in `api/openapi.commit`. To update, copy the file again, write the new commit, and run `npm run api:types`. A breaking API change then shows up as a type error.

## Open API gaps

See [docs/api-gaps.md](docs/api-gaps.md).
