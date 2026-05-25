# LetsGoRide Launch Readiness

This note captures the current launch checkpoint for the LetsGoRide mobile app and backend. It is safe to share internally, but it does not include secrets, API keys, passwords, OTPs, or private environment values.

## Stable Checkpoints

- Phase 1: `5c258d4` - Stabilize LetsGo Ride core flows and auth experience
- Phase 2: `31e7b15` - Polish LetsGo Ride auth and mobile experience
- Phase 3: `60a3ca8` - Polish admin operations command center
- Cleanup: `f13c45a` - Remove unused frontend car icon reference

## Launch-Ready Areas

- Email and password login with email verification and password reset.
- Passenger ride request flow, driver accept or decline, passenger cancellation, and seat updates.
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
- LetsGoRide does not currently request contacts access, microphone access, advertising tracking, or GPS location tracking.
- Verification documents are not visible to passengers or normal drivers. Admin access is required for document review.
- Some trip, safety, support, and admin records may be retained after account deletion where legally or operationally required.

## Ride Lifecycle Notes

- Public ride lists and search results should show only bookable rides with departure date and time still in the future.
- Ride detail can show a past ride as departed, but passengers should not be able to request a seat after departure.
- Current launch behavior uses the posted departure date and time, not GPS or live trip tracking.
- Scheduled "ride departure time reached" notifications are future work. Current launch behavior blocks new bookings after departure time, but it does not run a scheduler that wakes users exactly at departure time.
- Future versions can add driver start/completion actions, passenger trip completion confirmation, and automatic completion after departure time plus an estimated route duration.

## Final Regression Guardrails

- Do not upgrade Expo beyond SDK 54 without a dedicated compatibility pass.
- Do not reintroduce phone login as the primary public auth flow.
- Do not expose phone numbers, emails, verification documents, secrets, OTPs, reset codes, or full push tokens in public responses or logs.
- Keep public ride browsing free of private contact details.
- Keep admin document routes admin-only.
- Keep conversations scoped to the linked passenger, driver, or authorized admin investigation path.
