# LetsGoRide Platform V2 — Technical Decisions

## Mobile navigation

Keep the existing custom Expo Router navigation shell for Platform V2 instead of adopting SDK 54 native tabs. Expo Router native tabs are alpha in SDK 54, while LetsGoRide needs a highly controlled, branded, stable customer and worker navigation system.

## Maps

Use the repository's existing `react-native-maps` dependency as the primary map renderer for SDK 54. It is the stable Expo-supported option already installed in the project. Do not migrate Platform V2 to `expo-maps` while that library remains alpha.

Wrap map rendering behind LetsGoRide components/adapters so a future provider or renderer migration does not leak across product screens.

## Location

Use `expo-location` behind a permission-aware location service/hook.

- Customer flows request foreground location only when a map/location action requires it.
- Courier live operations may require background location later, but background permission must be requested only for an explicit active-work use case and configured through Expo app config/builds.
- Do not request broad location permissions at first launch without user context.
- Do not fake live locations when permission/provider data is unavailable.

## Data/domain architecture

Keep FastAPI + MongoDB and the current repository/service structure. Platform V2 adds new domain collections and services rather than rewriting the existing Ride domain.

New business lifecycles use explicit state transitions and event records. Mobile screens call typed service modules rather than assembling raw API requests in UI components.

## Compatibility

- Existing Ride API payloads stay compatible unless an intentional migration is documented.
- Existing authentication/session behavior remains the source of identity.
- Driver/Courier/Merchant are capabilities of the same user identity, not separate user databases.
- Provider secrets belong in environment configuration and are never committed.
