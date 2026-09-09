# LetsGoRide API

FastAPI backend for the LetsGoRide mobile product.

## What Was Rebuilt

- FastAPI app under `backend/app`.
- MongoDB support through Motor when `MONGODB_URI` is configured.
- In-memory fallback when MongoDB is not configured, so Expo Go can run locally.
- Demo rides are disabled by default and should stay disabled in production.
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

Copy `.env.example` to `.env` later if you need MongoDB. Do not commit secrets.

If `MONGODB_URI` is empty, `/health` returns `database_status: "not_configured"` and the app uses memory storage.

Email verification uses Resend when `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are configured. The backend never returns verification codes in API responses.

Admin login can be seeded on startup with `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD`, and `ADMIN_AUTO_CREATE=true`. This is idempotent and updates the stored password hash if the hosting environment password changes. Never commit admin credentials.

Set `ENABLE_DEMO_SEED=false` in production. Demo rides are only for local testing and are inserted only when `ENABLE_DEMO_SEED=true` and the rides collection is empty.

Public ride endpoints hide records where `is_demo=true`. Admin users can remove seeded demo rides with `DELETE /admin/rides/demo`; this cleanup deletes only rides marked `is_demo=true` and preserves real rides plus all users, requests, support messages, reports, and verification records.
