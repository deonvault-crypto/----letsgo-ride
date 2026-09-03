# Mobile product motion review

Source: `platform-v2-m1-m6` at `b8cf4084b29315620ad5f7d2ba026e95ac3d215a`.

## Task and information before components

| Flow | Primary task and information | Motion decision |
| --- | --- | --- |
| Ride selection | Choose a real enabled class; request a server quote, then confirm its fare. | Brief selection feedback and a check mark. Existing vehicle assets and mappings remain unchanged. Remove the selected glow. |
| Booking panel | Keep locations, class, fare and payment choices reachable. | Measure content; animate height for 180 ms within the existing viewport limit. First layout and orientation changes settle immediately. Overflow remains scrollable. |
| Driver search | Understand whether matching is active, reconnecting or unsuccessful; retain cancellation and retry. | Native activity feedback only during a real pending state. Remove elapsed-time search stages, invented progress and radar decoration. A confirmed trip still opens immediately. |
| Driver and trip | Read the assigned person, vehicle, trip state and existing safety actions. | One brief transition when identity or status changes. A completion check requires `COMPLETED`. Missing ratings no longer imply a verified/new-driver badge. |
| Live location | Locate the actual assigned driver or courier. | Interpolate only between received coordinates. Initial fixes, long gaps, large corrections and the antimeridian snap. Ignore older timestamps; use the shortest heading turn; reset for another trip/person. No extrapolation or recurring animation. |
| Buttons | Register a tap and show existing loading/disabled state. | 90 ms press / 140 ms release. Actions execute on press, independently of animation completion. |
| Support | Read and reply in the same protected conversation. | Initial history is static. New confirmed items appear once; duplicate refreshes and draft typing do not replay motion. Outgoing text uses readable contrast. No typing indicator is invented. |
| Food and courier | Read confirmed kitchen, collection, transit and delivery states. | Existing state indicators transition briefly. Remove courier radar, pulsing marker, bouncing completion and decorative gradients. Retain pricing, handoff PINs, cancellation and reviews. |

## System behavior

- Built-in React Native animation APIs; no new dependencies or native configuration.
- One shared set of system listeners. Motion is off until the accessibility preference is known, off with Reduce Motion, and stopped when the app is inactive.
- Transitions do not gate actions, navigation, data updates or replies. They stop on interruption/unmount and do not replay on resume.
- Existing API clients, realtime subscriptions, authentication, permissions, routes, fare logic, vehicle assets and release settings are preserved.
- Small/simple state transitions use the native driver. Measured height and native map coordinates use short JS-driven updates; they do not poll the server or run continuous timers.

## Mandatory self-review

| Check | Result |
| --- | --- |
| Unnecessary cards / card nesting | No new visual surfaces. The assigned-driver group is a simple row; shared motion replaces or wraps existing elements without adding decoration. |
| Unnecessary rounded corners | No new rounded control system. Existing shapes remain, with the courier status surface using the existing medium radius. |
| Gradients / effects | None added. Selected glow, courier gradients and repeated decorative effects are removed. |
| Icon consistency | Existing MaterialCommunityIcons family retained. Checks communicate real selection/completion; the missing-rating badge is removed. |
| Explanatory text / headings / alignment | No marketing copy or hero sections added. Search copy is shorter, receipt heading is smaller, unnecessary chat implementation copy is removed. |
| Generic screen templates / fake data / badges | No new templates, fabricated prices, ETAs, counts, availability, progress or badges. |
| Keyboard and focus | Existing input, keyboard avoidance, focus and navigation code retained. Transcript memoization keeps draft typing from re-rendering its history. Physical keyboard interaction is still a device check. |
| Safe areas / scrolling / long content | Booking height is bounded by screen size and top clearance; its ScrollView remains. Search gains bounded scrolling. Automated tests exercise long addresses and bounded height at small and rotated window sizes. Dynamic text and physical layout remain device checks. |
| Loading / empty / error / offline / retry | Existing handlers retained. Motion never supplies success data; search reconnect/no-driver recovery and failed chat drafts are tested. |
| Accessibility | Shared Reduce Motion behavior, readable outgoing chat text, selection check plus accessibility state, and busy/disabled semantics. VoiceOver/TalkBack and maximum text-size operation still need device testing. |
| Native behavior / preserved functionality | Native navigation, maps and controls retained. Request/payment/support/cancellation handlers are checked for unchanged implementation. |
| Unrelated changes | No backend, Ops, pricing rules, credentials, package IDs, dependencies, store configuration or version bump in this PR. |
| Restraint | Removed perpetual movement, mock search progress, redundant status decoration and unsupported verification text. Motion communicates only a real interaction or state update. |

## Verification

Focused tests exercise shared preference subscriptions and races, interruption/resume, immediate button actions, stale/duplicate/first GPS fixes, heading wrap, new-assignee reset, chat history/deduplication/failure, server-fare confirmation, disabled classes, bounded sheet layout and search recovery. Existing service and realtime tests are retained. Production CI must pass before preparing a release candidate.

Device verification remains required: iOS and Android scrolling/keyboard behavior, native marker rendering, small screens and maximum text sizes, VoiceOver/TalkBack, Reduce Motion toggled while interacting, app background/resume, and an actual customer-to-Ops support conversation. Automated results are not a claim that these physical-device checks passed.
