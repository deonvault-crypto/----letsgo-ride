# LetsGo Ride

Clean MVP rebuild checkpoint for the mobile app and backend.

## Scope

The public website folder is `frontend` and was not edited, deleted, moved, rebuilt, or renamed during this rebuild.

Active rebuild folders:

- `mobile`: Expo Router TypeScript mobile app.
- `backend`: FastAPI API.

Preserved brand assets:

- `_preserved_brand_assets`

Archived old active app/API folders:

- `_archive/clean-rebuild-20260523-132512/mobile`
- `_archive/clean-rebuild-20260523-132512/letsgoride-mobile`
- `_archive/clean-rebuild-20260523-132512/backend`

## Start Backend

```powershell
cd C:\Users\mmm\----letsgo-ride\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 4000 --reload
```

## Start Mobile

```powershell
cd C:\Users\mmm\----letsgo-ride\mobile
npm install
npx expo start --lan --port 8082 -c
```

## API Base URL

Mobile uses the local LAN API URL in:

```text
mobile/constants/config.ts
```

Current value:

```text
http://192.168.0.21:4000
```

## Demo OTP

Use `123456` for local mock OTP verification.

## Current MVP Limits

- No real SMS OTP provider.
- No live payments or service fees.
- No maps SDK.
- No KYC provider.
- No real emergency or police integration.
- MongoDB is optional for local dev; when `MONGODB_URI` is missing the backend uses memory storage.

## Next Phases

- Add real OTP provider.
- Add admin review tools for reports and driver verification.
- Add maps and pickup/drop-off geocoding.
- Add payment intent/deposit-proof workflows only after product rules are final.
