# LetsGo Ride API

FastAPI backend for the LetsGo Ride mobile product.

## What Was Rebuilt

- FastAPI app under `backend/app`.
- MongoDB support through Motor when `MONGODB_URI` is configured.
- In-memory fallback when MongoDB is not configured, so Expo Go can run locally.
- Zimbabwe seed rides are added only when a database is empty.
- Phone verification is ready for a real OTP provider.

## Start Backend

```powershell
cd C:\Users\mmm\----letsgo-ride\backend
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
