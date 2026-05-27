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

```powershell
cd C:\Users\mmm\----letsgo-ride\mobile
npm install
npx expo start --lan --port 8082 -c
```

Open the project in Expo Go using the LAN QR code.

## API Base URL

The mobile API base URL is defined in:

```text
mobile/constants/config.ts
```

Current live URL:

```text
https://letsgoride-backend.onrender.com
```

## Authentication

- Email and password are the primary login method.
- New accounts verify email once with a six-digit code.
- Phone numbers are optional during signup and required before booking or posting rides.
- Optional biometric login can be enabled after a successful login.

## Current Product Limits

- No real payments yet.
- No maps SDK yet.
- No KYC provider yet.
- Driver verification uses manual LetsGoRide admin review.

---

## iOS Build & EAS Deployment

### Build Requirements

- **macOS or Linux** required to build iOS native code
- **Xcode** 15.0+ for iOS 15+ support
- **CocoaPods** for native dependency management
- EAS CLI: `npm install -g eas-cli`

### iOS Prebuild Process

1. On macOS, run:
   ```bash
   npx expo prebuild --platform ios --clean
   ```
   This generates the native iOS project with the FaceTec plugin integration.

2. Validate the build:
   ```bash
   npx eas build --platform ios --profile development
   ```

3. For production releases:
   ```bash
   npx eas build --platform ios --profile production
   ```

### FaceTec Native Integration

#### Architecture

- **FaceTecSDK.framework** located at `mobile/vendor/facetec/ios/`
- Native module: `LetsGoRideFaceTec` (defined in Xcode native build)
- JavaScript bridge via `facetecService.ts`

> Note: With EAS remote versioning enabled, `ios.buildNumber` in `app.json` is ignored. EAS manages the build number automatically during production builds.

#### How It Works

1. **iOS build includes** the FaceTec framework and native module automatically during `expo prebuild`
2. **At runtime**, the service checks `isFaceTecNativeAvailable()` before offering biometric verification
3. **Fallback path**: If native module unavailable or verification fails, users fall back to manual document review

#### Manual Document Review (Always Available)

All drivers can submit identity and vehicle documents for manual review by LetsGoRide admins, regardless of biometric availability:

- Identity document (government-issued)
- Driver license
- Vehicle registration or logbook
- Optional vehicle photos

This ensures verification is always possible even if FaceTec native is unavailable.

#### Testing FaceTec Locally

On **Expo Go** (development builds):
- FaceTec biometric is **unavailable** (native modules require native build)
- Manual document review UI still functions
- Use manual review for QA testing

On **EAS cloud builds** (iOS):
- FaceTec native is available if the framework is properly linked during prebuild
- Biometric flow should succeed for eligible users
- Fall back to manual review if needed

#### Verification Status Flow

1. User navigates to "Driver verification"
2. App checks `isFaceTecNativeAvailable()`
   - If **true**: Show FaceTec biometric option + manual review option
   - If **false**: Show manual review only
3. User chooses biometric or manual
4. On success: `verification_status` → `processing_biometrics` or `pending_manual_review`
5. Admin reviews and sets final status: `verified` or `rejected`

#### Error Handling

- **Native module missing**: Gracefully hidden; manual review offered
- **Biometric cancelled**: User can retry or switch to manual
- **API failure**: Clear error message with retry option
- **Document upload failure**: Validation and retry guidance provided

---

## Build Validation Checklist

Before submitting to App Store:

- [ ] `npx expo-doctor` shows 18/18 checks passed
- [ ] `npm run typecheck` passes with no errors
- [ ] `npx expo prebuild --platform android --clean` succeeds
- [ ] `npx expo prebuild --platform ios --clean` succeeds (on macOS)
- [ ] `npx eas build --platform ios --profile production` completes successfully
- [ ] FaceTec manual document upload works in QA build
- [ ] Passenger booking flow completes end-to-end
- [ ] Driver post trip and request management flows work
- [ ] Notifications (push & in-app) trigger correctly
