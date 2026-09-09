# LetsGoRide API

FastAPI backend for the LetsGoRide mobile product.

## What Was Rebuilt

- FastAPI app under `backend/app`.
- MongoDB support through Motor when `MONGODB_URI` is configured.
- In-memory fallback when MongoDB is not configured, so Expo Go can run locally.
- Email verification and password reset use Resend when configured.
- Phone numbers are stored for trip coordination after a user adds them, but phone login is not the public primary flow.

## Start Backend

From the repository root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 4000 --reload
```

## Health Checks

```powershell
Invoke-RestMethod http://localhost:4000/health
Invoke-RestMethod http://localhost:4000/rides
Invoke-RestMethod "http://localhost:4000/rides/search?origin=Harare&destination=Bulawayo&seats=1"
```

## Environment

Create a local `.env` file only when you need local environment overrides. Do not commit secrets.

If `MONGODB_URI` is empty, `/health` returns `database_status: "not_configured"` and the app uses memory storage.

Email verification uses Resend when `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are configured. The backend never returns verification codes in API responses.

Admin seeding is available for non-production development or test use with `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD`, and `ADMIN_AUTO_CREATE=true`. Production explicitly rejects `ADMIN_AUTO_CREATE=true` during configuration. Never commit admin credentials.
