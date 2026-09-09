# LetsGoRide Launch Readiness

This note captures the current launch checkpoint for the LetsGoRide mobile app and backend. It is safe to share internally, but it does not include secrets, API keys, passwords, OTPs, or private environment values.

## Platform V2 final-pass checkpoint — 2026-08-23

- Courier active work is server-owned: terminal jobs cannot hydrate the live workspace, offers pause during active work, and a database constraint prevents multiple active deliveries per courier.
- Courier progression is intentionally minimal: accept, confirm physical pickup, automatic in-transit/arrival updates, then recipient PIN handoff. Terminal records cannot restart tracking.
- Customer Activity has intentional guest, loading, error, empty, in-progress and history states. Live screens poll only while focused and in the foreground.
- Food shows active internal ordering separately from truthful, non-orderable `COMING_SOON` brand listings. Restaurant/menu images have loading and owned fallback media.
- Merchant onboarding uses `DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED → ACTIVE`, with admin-only review/activation and cash-on-delivery settlement labelled as not requiring a platform payout.
- Public signup creates Passenger accounts only. Existing reviewed worker identities remain usable; role provisioning is admin-only and audited.
- The staging backend and `letsgoride_staging` database are isolated from production. Do not write QA records to production.
- Real new-account QA remains blocked until staging Resend variables are configured. Mock phone OTP is disabled outside development unless staging is explicitly opted in.
- An installed iOS Preview build may be created only after the final Platform V2 CI run is green.

## Stable Checkpoints

- Phase 1: `5c258d4` - Stabilize LetsGo Ride core flows and auth experience
- Phase 2: `31e7b15` - Polish LetsGo Ride auth and mobile experience
- Phase 3: `60a3ca8` - Polish admin operations command center
- Cleanup: `f13c45a` - Remove unused frontend car icon reference

## Launch-Ready Areas

- Email and password login with email verification and password reset.
- Passenger ride request flow, driver accept or decline, passenger cancellation, and seat updates.
- Trip lifecycle statuses for scheduled, boarding, in-progress, completed, cancelled, and expired rides.
- Driver Start Trip and End Trip actions, passenger check-in, and automatic lifecycle fallback rules.
- In-app ride request messaging between authorized passenger and driver accounts.
- Driver manual verification with admin-only document review.
- Admin operations dashboard for users, rides, requests, verification, support, safety reports, and audit review.
- Profile photo upload and public driver photo display on ride cards without exposing phone or email publicly.
- In-app notifications scoped to the signed-in user.
- Light premium LetsGoRide mobile theme with current splash and icon assets under `mobile/assets/images`.

## Production Build Testing Still Needed

- Expo Go is useful for local testing, but push notifications and Face ID behavior should be tested in a development build or production build.
- Splash and app icon changes may require closing Expo Go, clearing cache, or rebuilding the installed development or production app.
- If Expo Go still shows an old native icon or splash image, close Expo Go, clear the Expo cache with `npx expo start -c`, and create a new development or production build. Native splash and icon assets are bundled into installed app builds.
- App Store and Play Store builds should be tested on real iOS and Android devices before public release.
- Render backend must be deployed and healthy before mobile testing. The mobile API base URL is `https://letsgoride-backend.onrender.com`.

## Manual QA Checklist

- Create account with a new email.
- Verify email with the received code.
- Log in with a verified account.
- Try duplicate email registration.
- Run forgot password and log in with the new password.
- Enable and disable biometric login from Settings.
- Upload a profile photo.
- Submit driver verification documents.
- Admin reviews verification documents and approves or rejects.
- Verified driver posts a ride.
- Passenger searches and requests a seat.
- Driver accepts or declines the request.
- Passenger and driver exchange in-app messages.
- Passenger cancels a pending and confirmed booking.
- Confirm seats update correctly after accept and cancel.
- Submit support and safety reports.
- Admin reviews users, rides, bookings, support, safety, and audit screens.
- Log out and log in as a different account; confirm no stale user data appears.

## Store Privacy Notes

- Camera access is not required unless a future document/photo capture flow is added.
- Photo library access is used when a user chooses a profile photo or verification document from their device.
- Document upload is used for manual driver verification.
- Notifications are used for ride updates, booking requests, messages, support replies, and safety alerts.
- Real lock-screen push notifications require device permission, a registered Expo push token, and development or production build testing. Expo Go can verify in-app notification records and most permission/token wiring, but final push behavior must be tested in an installed build.
- Biometric login is optional and is only enabled after a user chooses it in Settings.
- Phone number is optional during signup and login. It is required before booking a seat or posting a ride for trip coordination and safety.
- LetsGoRide does not currently process online or in-app payments.
- Location permission is requested only when a driver chooses to share live progress during an active trip. LetsGoRide should not request continuous background tracking for normal browsing, login, search, or account management.
- LetsGoRide does not currently request contacts access, microphone access, advertising tracking, or always-on GPS tracking.
- Verification documents are not visible to passengers or normal drivers. Admin access is required for document review.
- Some trip, safety, support, and admin records may be retained after account deletion where legally or operationally required.

## Ride Lifecycle And Live Trip Notes

- Public ride lists and search results show only bookable `SCHEDULED` rides with departure date and time still in the future.
- Driver screens use an authenticated trip feed so scheduled, boarding, in-progress, completed, cancelled, and expired trips remain visible to the owner.
- Start Trip appears to the driver 15 minutes before departure. If the driver does not start the trip manually, the backend lifecycle sweeper moves it to `IN_PROGRESS` after departure time.
- End Trip marks the trip `COMPLETED`, archives it in history, and disables live sharing.
- Trips auto-complete after estimated arrival time plus a 60 minute grace buffer.
- Passenger check-in stores a timestamp on the confirmed ride request and is available during boarding or in-progress trips.
- Optional live trip sharing uses foreground location only while a trip is `IN_PROGRESS`. Drivers can disable sharing, and sharing stops when the trip completes.
- Real background location should remain future work unless App Store and Play Store review requirements are handled with a dedicated privacy pass.
- Later versions can add driver/passenger completion confirmation, trusted-contact sharing links, and route-specific ETA services.

## Final Regression Guardrails

- Do not upgrade Expo beyond SDK 54 without a dedicated compatibility pass.
- Do not reintroduce phone login as the primary public auth flow.
- Do not expose phone numbers, emails, verification documents, secrets, OTPs, reset codes, or full push tokens in public responses or logs.
- Keep public ride browsing free of private contact details.
- Keep admin document routes admin-only.
- Keep conversations scoped to the linked passenger, driver, or authorized admin investigation path.
