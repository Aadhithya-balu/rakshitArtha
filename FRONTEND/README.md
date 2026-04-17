# RakshitArtha - Frontend (React Native)

## 🚀 Live Backend (Already Deployed on AWS)
- Insurance API: http://13.205.17.56:5000/health ✅
- Automation API: http://13.205.17.56:3000/health ✅

No backend setup needed. The app connects to these URLs automatically.

---

## Option 1: Run on Android Phone (USB)

### Prerequisites
- Node.js 20 LTS
- Android Studio + Android SDK
- USB debugging enabled on phone

### Steps
```bash
cd FRONTEND
npm install
npx react-native start --port 8081 --reset-cache
```

In a second terminal:
```bash
adb reverse tcp:8081 tcp:8081
npx react-native run-android
```

---

## Option 2: Build APK via EAS Cloud (No Android Studio needed)

```bash
npm install -g eas-cli
cd FRONTEND
npm install
eas login        # use account: aadhi0511 or create free account at expo.dev
eas build --platform android --profile preview
```

This builds in the cloud (~10 min) and gives a downloadable APK link.

---

## Option 3: Install Pre-built APK

If an APK is available in the `/releases` section of this repo, download and install it directly on any Android phone.

---

## Tech Stack
- React Native 0.76.5
- TypeScript
- NativeWind (Tailwind for RN)
- Firebase Push Notifications
- TanStack Query
