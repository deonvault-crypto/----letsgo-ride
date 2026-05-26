# FaceTec Server Deployment

LetsGoRide uses the mobile FaceTec Device SDK with a private backend gateway. The mobile app must never hold server credentials. The backend calls a private FaceTec Server SDK service through `FACETEC_SERVER_URL`.

## Required Environment

Backend:

- `FACETEC_SERVER_URL`: private FaceTec server URL reachable only by the backend.
- `FACETEC_DEVICE_KEY_IDENTIFIER`: public Device Key Identifier issued for LetsGoRide.
- `FACETEC_SERVER_KEY_IDENTIFIER`: server key identifier issued after the FaceTec server registers with orchestration.
- `FACETEC_MIN_MATCH_LEVEL`: default `4`.
- `FACETEC_HIGH_CONFIDENCE_THRESHOLD`: default `0.98`.

Container:

- `FACETEC_SERVER_SDK_DIR`: directory containing the licensed FaceTec server artifact, for example `facetec-server.jar`.
- `FACETEC_CONFIG_DIR`: directory containing encrypted FaceTec server configuration.
- `FACETEC_ORCHESTRATION_URL`: FaceTec orchestration URL if required by the licensed server package.
- `FACETEC_SERVER_KEY_IDENTIFIER`: populated once FaceTec issues it.

## Local Container Shape

```powershell
cd backend/deploy/facetec
docker compose --env-file .env.facetec -f docker-compose.facetec.yml up -d --build
```

The server SDK artifact is mounted read-only. Encrypted config and generated operational data are stored outside the image, so keys can rotate without rebuilding.

## Backend Gateway Contract

- `GET /api/facetec/session-token`
  - Authenticated.
  - Rate limited.
  - Starts `processing_biometrics`.
  - Returns only a session token, public device key, and external database ref.

- `POST /api/verify-user`
  - Authenticated.
  - Rate limited.
  - Accepts encrypted FaceTec payloads from the mobile SDK.
  - Forwards FaceMap and ID scan payloads to the private FaceTec server.
  - Auto-approves only when liveness and high confidence checks pass.
  - Flags uncertain results for manual admin review instead of blocking the user.

Do not log FaceMaps, document images, full provider payloads, API keys, server keys, or authorization headers.
