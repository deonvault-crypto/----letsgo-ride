# iOS Build & Release Guide

## Prerequisites

- macOS 12.0 or later
- Xcode 15.0 or later
- Apple Developer Account (for App Store submission)
- EAS CLI: `npm install -g eas-cli`

## Step 1: Prebuild Locally (Recommended)

On macOS, generate the native iOS project:

```bash
cd mobile
npx expo prebuild --platform ios --clean
```

This creates the `ios/` directory with the Xcode project including:
- FaceTec framework linked
- All plugins configured
- Native modules initialized

### Troubleshooting Prebuild

If prebuild fails, verify:
- All dependencies installed: `npm install`
- `app.json` is valid: `npx expo-doctor` shows 18/18 checks
- iOS version in `app.json` matches Xcode: `ios.deploymentTarget`

## Step 2: Build with EAS (Production)

Use EAS to build the production iOS app:

```bash
npx eas build --platform ios --profile production
```

### What Happens

1. EAS cloud spins up a macOS builder
2. Runs `expo prebuild --platform ios`
3. Compiles native code with CocoaPods
4. Links FaceTec framework
5. Creates a signed IPA for App Store distribution

### Monitor Build

- Check build status: `npx eas build:list`
- Download build: `npx eas build:download --id <build-id>`

## Step 3: Validate the iOS Build

Once built, test on a real device or simulator:

1. Download the `.ipa`
2. Install using Xcode or Apple Configurator
3. Test flows:
   - [ ] App launches without crash
   - [ ] Welcome → login works
   - [ ] Passenger home → search → results → ride detail works
   - [ ] Booking flow completes
   - [ ] Driver verification: manual document upload works
   - [ ] Notifications trigger correctly

## Step 4: App Store Submission

### Build Number Increment

Before submission, increment build number in `app.json`:

```json
"ios": {
  "buildNumber": "8"
}
```

### Create App Store Connect Record

1. Log in to App Store Connect
2. Create new app with Bundle ID: `co.zw.letsgoride`
3. Fill in app metadata:
   - Screenshots (5-6 per orientation)
   - Description, keywords, support URL
   - Privacy policy URL
   - Screenshot captions

### Submit Build for Review

```bash
npx eas submit --platform ios --latest
```

This:
- Uploads the IPA to App Store Connect
- Creates a build for review
- Monitors submission status

### App Store Review Guidelines

Ensure compliance:
- ✅ Privacy policy included and accessible
- ✅ User data collection disclosed
- ✅ Permissions justified (camera, location, contacts)
- ✅ No hardcoded credentials or debug data
- ✅ All features functional (no placeholder screens)
- ✅ FaceTec verification fallback works

## FaceTec on iOS

### Framework Location

```
mobile/vendor/facetec/ios/FaceTecSDK.framework
```

### How It's Linked

During `expo prebuild --platform ios`:
1. Plugin `withFaceTec` runs
2. **Note**: Current plugin does NOT add framework automatically (deferred to bare native workflow)
3. If using EAS prebuild, ensure the build system has access to the framework

### For Manual Native Integration

If you need to manually link FaceTec in Xcode:

1. Open `ios/LetsGoRide.xcworkspace` in Xcode
2. Select target → Build Phases
3. Link Binary With Libraries: Add `FaceTecSDK.framework`
4. Set Framework Search Paths: `$(PROJECT_DIR)/../vendor/facetec/ios`
5. Build settings → Embedded Content Contains Swift Code: Yes

### Testing FaceTec

- Biometric is **only available** on physical iOS devices with Face ID/Touch ID
- Test on iPhone 12+  recommended for Face ID
- Fallback to manual document review if biometric unavailable

## Rollback Plan

If iOS build has critical issues:

```bash
npx eas update --platform ios --branch hotfix
```

This rolls back users to a previous build via OTA update.

## Common Issues

| Issue | Solution |
|-------|----------|
| **CocoaPods conflict** | `cd ios && pod repo update && pod install --repo-update` |
| **Memory error during build** | Use `eas build --platform ios --clear-cache` |
| **FaceTec framework not found** | Verify vendor path exists: `ls mobile/vendor/facetec/ios/` |
| **App rejected by App Store** | Check App Store Review feedback; update `app.json` and resubmit |

## Monitoring & Support

- **EAS Dashboard**: https://expo.dev/eas
- **App Store Analytics**: https://appstoreconnect.apple.com
- **Crash logs**: TestFlight builds provide crash data
- **User support**: In-app support form in `/(shared)/support`
