# Ops communications and app updates

This change connects Ops publishing to the existing customer notification inbox, phone push service and authenticated realtime connection. It also prepares future mobile builds to receive compatible Expo updates at the next app launch.

Base: `fde7df4040cfd71c1d9faa871a206d5de402c6ea`, the motion candidate already built as Android 28 and iOS 44. Those binaries remain unchanged.

## Operator workflow

1. Open **Communications → New announcement**.
2. Choose marketing, service update, safety alert or app update; enter the title and message.
3. Select product roles and, optionally, specific account IDs. Choose an existing app action.
4. Choose inbox-only or inbox plus eligible phone notifications, a send time and an expiry.
5. Save and preview. The audience count describes matching accounts; marketing consent and account status are rechecked at delivery.
6. An Admin sends or schedules the reviewed revision. Repeated publish requests do not start another campaign.
7. Review inbox creation, Expo acceptance, app reads, unknown outcomes and failed pushes. Stop remaining delivery if necessary.

| Capability | CS | Manager | Admin |
| --- | --- | --- | --- |
| Read announcements and delivery counts | Yes | Yes | Yes |
| Create/edit drafts and preview audience | No | Yes | Yes |
| Publish, schedule or stop a send | No | No | Yes |
| Read store release information | No | Yes | Yes |
| Publish store release information | No | No | Yes |

Permissions are enforced by backend dependencies, including current staff enablement, rather than by hidden buttons alone. Actions enter the existing Audit Trail.

## Customer workflow

- The existing inbox receives announcements; push taps open the exact owned announcement, including after a cold start and sign-in.
- The detail screen shows the full message and an allowlisted, role-appropriate action. Expired messages cannot launch their action.
- Offers require explicit consent to both inbox marketing and promotional push. Old “Product news” preferences do not silently become promotional consent. Customers can opt out even with phone notifications disabled.
- Foreground push and authenticated notification events refresh the shared inbox. Events arriving during a fetch trigger reconciliation afterward. No repeating inbox polling is added.
- Existing support, ride, food, courier, authentication, pricing and navigation contracts remain in place.

## Delivery audit

| Check | Result / implementation |
| --- | --- |
| Duplicate publish requests | Revision check and atomic draft-to-queue transition; no duplicate fan-out. |
| Multiple backend instances | Atomic campaign lease and deterministic recipient IDs, with a unique index for campaign deliveries. |
| Restart during push | Existing recipients are not re-sent. An ambiguous provider attempt is reported as unknown. |
| Bounded work | Five recipients per batch; indexed due-work selection. Safety alerts take priority over ordinary campaigns. |
| Scheduling and expiry | Timezones required; expiry checked before and during delivery. |
| Withdrawal / suspension | Consent and account eligibility checked at delivery. New accounts after publication are outside the audience. |
| Customer isolation | Detail reads require the current recipient; realtime signals contain an ID and target only that recipient. |
| Push-token account switch | New registration deactivates the same token on previous accounts. |
| Payload injection | No arbitrary URLs, JS, HTML actions or unvalidated navigation destinations. Ops output is escaped and tested with HTML-shaped content. |
| Honest metrics | “Accepted by push provider” is not labelled delivered to phone. Reads require the app read endpoint. |
| Cancellation | Stops further work; previously delivered messages and an in-flight provider request cannot be recalled. |

## App-update audit

- `expo-updates` is installed at the Expo SDK 54 compatible version.
- The update origin is the existing EAS project. Runtime fingerprints separate incompatible native builds.
- Updates check at launch with zero launch wait. Downloaded changes apply on a subsequent launch; application code never invokes an update reload.
- A customer may check/download compatible improvements manually. Concurrent checks share one request; failures retain the installed app and remain retryable.
- Ops controls public store-version information and release notes. Store destinations are fixed server- and client-side. Unpublished versions are hidden and version comparison never recommends a downgrade.
- The reviewed OTA workflow only runs manually on the production branch, requires successful CI for its exact source commit, pins EAS CLI, and blocks rerun duplication.
- Ops communications do not execute arbitrary code or upload binaries. Native/SDK/permission changes still require store builds. The existing builds 28/44 cannot gain this native update facility retroactively.
- No campaign, OTA package, App Review submission or public store release is sent by the audit.

## Product UI self-review

The primary tasks are reading an announcement, choosing an existing action, controlling consent, checking updates and publishing a reviewed message. The work reuses Screen, AppButton, existing icons, safe areas, scrolling, typography and the established monochrome palette.

No new decorative cards, gradients, oversized headings, statistics, ratings, badges or invented offers are added. The notification list uses rows and dividers. Loading, empty, error, retry, expired, long-message and offline-with-existing-inbox states have explicit behavior. Drafts remain available after save errors; submit controls prevent repeated interaction. Role-specific actions and unavailable updates are omitted.

## Validation and remaining checks

- Full backend regression suite passed before the final bounded-queue additions; rerun and final CI results are recorded in the PR.
- TypeScript and Android release-policy verification passed.
- New tests cover HTTP authorization, revoked staff, consent, idempotency, interrupted delivery, expiry, private reads, account switches, fixed store links, notification cold starts, safe update downloads and Ops form behavior.
- DOM tests verify draft save/preview, default inbox-only delivery, escaped content and CS restrictions.
- The cloud browser could not reach the local preview (`ERR_BLOCKED_BY_CLIENT`), so no visual browser pass is claimed.
- Physical iOS/Android checks remain necessary for push permission prompts, killed-app taps, native update downloads, maximum text size, screen readers and actual customer-to-Ops messaging.

References: [Expo runtime compatibility](https://docs.expo.dev/eas-update/runtime-versions/), [Expo update downloads](https://docs.expo.dev/eas-update/download-updates/), [Apple push notification requirements](https://developer.apple.com/app-store/review/guidelines/).
