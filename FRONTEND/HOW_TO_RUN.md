# RakshitArtha Mobile - How To Run

This guide explains how to run the React Native app on Windows with an Android phone over USB.

## 1. Prerequisites

- Node.js 20 LTS recommended (project can be unstable on Node 24)
- Android Studio + Android SDK
- USB debugging enabled on phone
- Phone connected and authorized for ADB

## 2. Install Dependencies

From project root:

```powershell
npm install
```

Optional: if your backend runs on a different machine/IP, set a dynamic API host before starting Metro:

```powershell
$env:EXPO_PUBLIC_API_HOST='192.168.1.20'
```

The app auto-detects Metro host first, then uses this value as fallback for backend calls.

## Firebase Push (OS-level notifications)

1. Add Android Firebase config file:
	- Place `google-services.json` in `android/app/google-services.json`.
2. Add iOS Firebase config (if building iOS):
	- Place `GoogleService-Info.plist` in the iOS app project.
3. Ensure automation backend has Firebase Admin credentials configured in `automation-system/.env`.
4. Rebuild the mobile app after adding Firebase files:

```powershell
npx react-native run-android
```

Without Firebase files, in-app banners still work, but OS-level push will be skipped.

## Push Verification Checklist

1. Confirm Android file exists:
	- `android/app/google-services.json`
2. Start full stack:
	- `./startup.ps1`
3. Open app and sign in once to register device token with backend.
4. Trigger a notification event (demo claim or risk refresh) and verify:
	- In-app banner appears immediately.
	- OS push appears in notification tray when app is backgrounded.
5. If no OS push arrives:
	- Ensure notification permission is granted in Android settings.
	- Check backend user profile has `deviceTokens` populated.
	- Check automation logs for Firebase push failures.

## 3. Verify Phone Connection

```powershell
$env:PATH='C:\Users\Ashwin\AppData\Local\Android\Sdk\platform-tools;' + $env:PATH
adb start-server
adb devices -l
```

You should see your device with status `device`.

## 4. Start Metro (Dev Server)

```powershell
npx react-native start --port 8081 --reset-cache
```

Keep this terminal open.

## 5. Install and Run App on Phone

Open a second terminal in project root:

```powershell
$env:ANDROID_HOME='C:\Users\Ashwin\AppData\Local\Android\Sdk'
$env:ANDROID_SDK_ROOT='C:\Users\Ashwin\AppData\Local\Android\Sdk'
$env:PATH='C:\Users\Ashwin\AppData\Local\Android\Sdk\platform-tools;' + $env:PATH
adb reverse tcp:8081 tcp:8081
npx react-native run-android --device GUPRE675WWW4USKF
```

If device id changes, replace `GUPRE675WWW4USKF` with the current id from `adb devices -l`.

## 6. Reload While Developing

In Metro terminal, press:

- `r` to reload app
- `d` for Dev Menu

## 7. Common Fixes

### A) Metro error: "Cannot read properties of undefined (reading 'handle')"

1. Stop all node/adb debug processes.
2. Run:

```powershell
npx react-native start --port 8081 --reset-cache
```

3. In another terminal:

```powershell
adb reverse --remove-all
adb reverse tcp:8081 tcp:8081
npx react-native run-android --device GUPRE675WWW4USKF
```

If this keeps happening, switch to Node 20 LTS.

### B) App installed but cannot connect to dev server

```powershell
adb reverse --remove-all
adb reverse tcp:8081 tcp:8081
```

Then reload app.

### C) Build/Install fails intermittently

- Reconnect USB cable
- Re-run `adb devices -l`
- Ensure phone status is `device` (not `unauthorized`)

## 8. Stop Debugging Cleanly

```powershell
adb reverse --remove-all
adb shell am force-stop com.rakshitartha
adb kill-server
```

Then stop Metro terminal (`Ctrl + C`).
