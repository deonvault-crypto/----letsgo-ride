# iOS Build & Release Guide

## Prerequisites

- macOS 12.0 or later
- Xcode 15.0 or later
- Apple Developer Account for App Store submission
- EAS CLI: `npm install -g eas-cli`

## Step 1: Prebuild Locally

On macOS, generate the native iOS project:

```bash
cd mobile
npx expo prebuild --platform ios --clean
```

This creates the `ios/` directory with the Xcode project, configured plugins, and native modules initialized.

### Troubleshooting Prebuild

If prebuild fails, verify:

- All dependencies are installed: `npm install`
- `app.json` is valid: `npx expo-doctor`
- iOS configuration in `app.json` matches the Xcode target requirements

## Step 2: Build with EAS

Use EAS to build the production iOS app:

```bash
npx eas build --platform ios --profile production
```

### What Happens

1. EAS cloud starts a macOS builder.
2. It runs `expo prebuild --platform ios`.
3. It compiles native code with CocoaPods.
4. It creates a signed IPA for App Store distribution.

### Monitor Build

- Check build status: `npx eas build:list`
- Download build: `npx eas build:download --id <build-id>`

## Step 3: Validate the iOS Build

Once built, test on a real device or simulator:

1. Download the `.ipa`.
2. Install using Xcode or Apple Configurator.
3. Test flows:
   - [ ] App launches without crash
   - [ ] Welcome to login works
   - [ ] Passenger home to search to results to ride detail works
   - [ ] Booking flow completes
   - [ ] Driver verification document upload works
   - [ ] Notifications trigger correctly

## Step 4: App Store Submission

### Build Number Handling

When using EAS remote versioning, `ios.buildNumber` in `app.json` is ignored for production builds. EAS auto-increments the build number during the build process, so keep your app version in `expo.version` and rely on EAS-managed build versioning.

### Create App Store Connect Record

1. Log in to App Store Connect.
2. Create a new app with Bundle ID: `co.zw.letsgoride`.
3. Fill in app metadata:
   - Screenshots
   - Description, keywords, support URL
   - Privacy policy URL
   - Screenshot captions

### Submit Build for Review

```bash
npx eas submit --platform ios --latest
```

This uploads the IPA to App Store Connect, creates a build for review, and monitors submission status.

### App Store Review Guidelines

Ensure compliance:

- Privacy policy included and accessible
- User data collection disclosed
- Permissions justified for camera, location, and photo library access
- No hardcoded credentials or debug data
- All features functional with no placeholder screens
- Driver verification document review works

## Rollback Plan

If an iOS build has critical issues:

```bash
npx eas update --platform ios --branch hotfix
```

This rolls users back to a previous build via OTA update.

## Common Issues

| Issue | Solution |
|-------|----------|
| CocoaPods conflict | `cd ios && pod repo update && pod install --repo-update` |
| Memory error during build | Use `eas build --platform ios --clear-cache` |
| App rejected by App Store | Check App Store Review feedback, update `app.json`, and resubmit |

## Monitoring & Support

- EAS Dashboard: https://expo.dev/eas
- App Store Analytics: https://appstoreconnect.apple.com
- Crash logs: TestFlight builds provide crash data
- User support: in-app support form in `/(shared)/support`
