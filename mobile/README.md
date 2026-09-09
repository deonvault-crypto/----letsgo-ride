# LetsGoRide Mobile

Expo Router TypeScript mobile app for LetsGoRide.

## What Was Rebuilt

- Expo Go compatible app in `mobile`.
- TypeScript screen architecture with Expo Router.
- Passenger flow: welcome, email login, email verification, home, search, results, ride detail, request seat, my trips.
- Driver flow: dashboard, post trip, trip details, passenger request actions.
- Shared flow: profile, settings, safety, report, support, notifications.
- Reusable UI components, cards, states, services, hooks, constants, types, and utilities.

## Start Mobile

From the repository root:

```bash
cd mobile
npm install
npx expo start --lan --port 8082 -c
```

Open the project in Expo Go using the LAN QR code.

## API Base URL

The mobile app reads its API origin from the `EXPO_PUBLIC_API_BASE_URL` environment variable in `mobile/constants/config.ts`. Non-development builds require this value to be configured explicitly.

The production EAS profile currently sets:

```text
https://letsgoride-v2-production.onrender.com
```

Development falls back to `http://127.0.0.1:8000` when `EXPO_PUBLIC_API_BASE_URL` is not set.

## Authentication

- Email and password are the primary login method.
- New accounts verify email once with a six-digit code.
- Phone numbers are optional during signup and required before booking or posting rides.
- Optional biometric login can be enabled after a successful login.

## Current Product Notes

- Ride Now includes Stripe card-payment support in source; availability is gated by payment configuration.
- Maps use `react-native-maps`; Android release builds require the configured Google Maps API key.
- No KYC provider yet.
- Driver verification uses LetsGoRide document review.

## iOS Build & EAS Deployment

### Build Requirements

- EAS CLI: `npm install -g eas-cli`
- EAS cloud iOS builds can be triggered from Windows, macOS, or Linux; the native build runs on EAS infrastructure.
- macOS, Xcode, and CocoaPods are required only when building or working with the iOS native project locally.
- This repository intentionally defines only the `production` EAS build profile.

### iOS EAS Build Process

For the configured production release build:

```bash
npx eas build --platform ios --profile production
```

For local iOS native-project work on macOS, you can generate the native project with:

```bash
npx expo prebuild --platform ios --clean
```

There is no `development`, `preview`, staging, or TestFlight EAS build profile in the current repository configuration.

### Driver Verification

All drivers can submit identity and vehicle documents for LetsGoRide review:

- Identity document
- Driver licence
- Vehicle registration or logbook
- Optional vehicle photos

With EAS remote versioning enabled, `ios.buildNumber` in `app.json` is ignored. EAS manages the build number automatically during production builds.

#### Verification Status Flow

1. User navigates to "Driver verification".
2. User uploads the required verification documents.
3. User submits the verification form for review.
4. Admin reviews and sets final status: `verified`, `needs_review`, or `rejected`.

#### Error Handling

- API failure: clear error message with retry option.
- Document upload failure: validation and retry guidance provided.

## Build Validation Checklist

Before submitting to App Store:

- [ ] `npx expo-doctor` shows 18/18 checks passed
- [ ] `npm run typecheck` passes with no errors
- [ ] `npx expo prebuild --platform android --clean` succeeds
- [ ] `npx expo prebuild --platform ios --clean` succeeds on macOS
- [ ] `npx eas build --platform ios --profile production` completes successfully
- [ ] Driver verification document upload works in QA build
- [ ] Passenger booking flow completes end-to-end
- [ ] Driver post trip and request management flows work
- [ ] Notifications, push and in-app, trigger correctly
