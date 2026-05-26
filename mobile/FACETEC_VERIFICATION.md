# FaceTec Verification Architecture

## Overview

LetsGoRide uses **FaceTec** for biometric identity verification with a **mandatory fallback** to manual document review. This dual-path architecture ensures verification is always available, even if the native FaceTec module is unavailable.

---

## Architecture Diagram

```
┌─────────────────────────────────────┐
│  Driver Verification Screen         │
└──────────────┬──────────────────────┘
               │
               ├─ Is FaceTec Available?
               │
        ┌──────┴──────┐
        │             │
       YES           NO
        │             │
        ▼             ▼
  ┌─────────────┐  ┌──────────────────┐
  │  FaceTec    │  │  Manual Review   │
  │  Biometric  │  │  Only            │
  │  + Manual   │  │                  │
  └──┬──────┬──┘  └────────┬──────────┘
     │      │              │
     │      └─── OR ────────┘
     │                │
     ▼                ▼
  ┌─────────────────────────────────┐
  │  Submit Verification Payload    │
  │  (biometric or documents)       │
  └───────────────┬─────────────────┘
                  │
                  ▼
           ┌─────────────────┐
           │  Backend API    │
           │  /api/verify    │
           └────────┬────────┘
                    │
                    ▼
           ┌─────────────────┐
           │  Admin Review   │
           │  (always fired) │
           └────────┬────────┘
                    │
                    ▼
        ┌─────────────────────────┐
        │  Verification Status    │
        │  verified / rejected    │
        └─────────────────────────┘
```

---

## Service Implementation

### `facetecService.ts`

#### Key Functions

1. **`isFaceTecNativeAvailable()`**
   - Checks if the native `LetsGoRideFaceTec` module is registered
   - Returns `false` on web platform
   - Returns `false` if module missing (Expo Go, dev builds, iOS without framework)

   ```typescript
   export function isFaceTecNativeAvailable() {
     return Platform.OS !== "web" && typeof nativeFaceTec?.startVerification === "function";
   }
   ```

2. **`startFaceTecVerification()`**
   - Entry point for biometric verification
   - Fetches session token from backend
   - Calls native module if available
   - Throws graceful error if unavailable → UI falls back to manual

   ```typescript
   export async function startFaceTecVerification() {
     const session = await getFaceTecSessionToken();
     if (!isFaceTecNativeAvailable()) {
       throw new Error("Biometric verification is not available in this build. You can still submit documents for manual review.");
     }
     // ... native call ...
   }
   ```

3. **`submitFaceTecPayload()`**
   - Sends scans (face + ID) to backend for processing
   - Backend performs liveness detection and document OCR
   - Result is stored in verification profile

---

## Verification UI Flow

### Screen: `app/(shared)/verification.tsx`

#### Conditional Rendering

```typescript
const showBiometricCard = canStartVerification(status) && isFaceTecNativeAvailable();
```

- **FaceTec available**: Show biometric card + manual option
- **FaceTec unavailable**: Show manual review only (no biometric card)

#### User Actions

1. **Click "Start biometric check"** (if available)
   - Calls `startFaceTecVerification()`
   - On success: Status updates to `processing_biometrics`
   - On error: Shows error message, user can retry or switch to manual

2. **Click "Use manual document review"**
   - User uploads: identity doc, driver license, vehicle registration
   - Optional: vehicle photos
   - Optional: review notes to admin
   - Submit consent checkbox + uploads
   - Status: `pending_manual_review`

3. **Admin reviews**
   - Backend has both biometric AND manual docs (if provided)
   - Admin makes final decision: `verified` or `rejected`
   - User notified via notification

---

## Fallback Strategy

### When Does Manual Review Trigger?

- **Biometric unavailable**: FaceTec native module not present (development, web, or iOS without framework)
- **Biometric cancelled**: User taps cancel during face/ID scan
- **Biometric failed**: Liveness check failed, document not readable, face not detected
- **User preference**: User explicitly chooses manual instead of biometric

### Manual Review Always Works

- No native dependencies
- Works on any platform (iOS, Android, web)
- Works in Expo Go
- Works in dev/prod builds without native module

### Error Messages

Clear, user-friendly messages:

```
"Biometric verification is not available in this build. You can still submit documents for manual review."

"Biometric verification was not completed. Please try again or use manual review."
```

---

## Testing Strategy

### Development (Expo Go)

- ✅ Manual document upload/submission
- ❌ FaceTec biometric (not available in Expo Go)
- ✅ Fallback UI (manual review shown)
- ✅ Admin verification dashboard

### EAS Development Build

- ✅ Manual document review
- ⚠️ FaceTec biometric (depends on successful native build)
- ✅ Fallback handling
- ✅ Full QA cycle

### EAS Production Build (iOS)

- ✅ Full FaceTec biometric flow
- ✅ Manual review fallback
- ✅ Performance testing (biometric latency, document upload)
- ✅ Error recovery (cancellation, timeout, network failure)

### Test Cases

#### Biometric Flow (if available)

1. [ ] User starts biometric verification
2. [ ] Face scan completes
3. [ ] ID scan (front + back) completes
4. [ ] Backend returns liveness & document confidence scores
5. [ ] Status updates to `processing_biometrics`
6. [ ] Admin reviews and approves
7. [ ] Status updates to `verified`

#### Manual Review Flow

1. [ ] User uploads identity document
2. [ ] User uploads driver license
3. [ ] User uploads vehicle registration
4. [ ] User adds optional review notes
5. [ ] User checks consent checkbox
6. [ ] Submission succeeds
7. [ ] Status updates to `pending_manual_review`
8. [ ] Admin reviews and approves
9. [ ] Status updates to `verified`

#### Error Handling

1. [ ] Network failure during session token fetch → Show error + retry
2. [ ] Biometric cancelled → Show "Cancelled" message + offer manual
3. [ ] Document upload fails → Show validation error + retry
4. [ ] Admin rejection → Notify user with reason + allow resubmission

---

## Deployment Checklist

Before release:

- [ ] FaceTec vendor files present: `mobile/vendor/facetec/ios/FaceTecSDK.framework`
- [ ] FaceTec service gracefully handles unavailable module
- [ ] Manual review UI tested end-to-end
- [ ] Admin dashboard shows verification requests
- [ ] Fallback error messages are clear and actionable
- [ ] iOS build includes FaceTec framework (after native setup)
- [ ] Android FaceTec SDK `.aar` present in `mobile/vendor/facetec/android/`
- [ ] Manual document upload works on all platforms

---

## Troubleshooting

### FaceTec Not Starting

**Symptom**: User taps "Start biometric check" but nothing happens

**Debug**:
```typescript
console.log(isFaceTecNativeAvailable()); // Should be true on device with framework
```

**Solutions**:
- Check native module is registered: `NativeModules.LetsGoRideFaceTec`
- On iOS: Verify framework linked in Xcode build settings
- On Android: Verify `.aar` in gradle dependencies
- Fallback to manual: Always works

### Session Token Fetch Fails

**Symptom**: "Unable to load session" error

**Debug**: Verify backend endpoint `/api/facetec/session-token` is accessible

**Solutions**:
- Check API_BASE_URL in `mobile/constants/config.ts`
- Check backend credentials in EAS secrets
- Implement retry logic (already present)

### Admin Verification Dashboard Empty

**Symptom**: No verification requests appear for admin

**Debug**: Check backend verification queue

**Solutions**:
- Ensure verification payload reaches backend
- Check admin role is set correctly in user record
- Verify backend is storing verification profiles

---

## Future Enhancements

- [ ] Batch verification processing for admins
- [ ] Automated liveness scoring and auto-approval for high-confidence scans
- [ ] Webhook notifications when verification status changes
- [ ] Admin audit trail for verification decisions
- [ ] Retry limits and cooldown periods for failed verification attempts
