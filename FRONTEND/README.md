# Sorcerers of Code Frontend (React Native)

This frontend uses Expo + React Native + TypeScript.

## Local development

1. Install dependencies:

```bash
npm install
```

2. Start Expo:

```bash
npm run start
```

3. Run on a platform:

```bash
npm run android
npm run ios
npm run web
```

## Deployment-ready setup (EAS)

This project already includes:

- EAS profiles in `eas.json`
- app identifiers in `app.json`
- build and submit scripts in `package.json`

### One-time setup

1. Log in to Expo:

```bash
npx eas login
```

2. Configure project on Expo:

```bash
npx eas init
```

### Build

```bash
npm run build:android
npm run build:ios
npm run build:all
```

### Submit to stores

```bash
npm run submit:android
npm run submit:ios
```

### OTA update

```bash
npm run update:prod
```

## Important next step

Before publishing, update these values in `app.json` to your final app identity:

- `expo.ios.bundleIdentifier`
- `expo.android.package`
