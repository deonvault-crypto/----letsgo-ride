from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.database import database
from app.routers import admin, auth, drivers, health, reports, requests, rides, support, verification, waitlist
from app.services.ride_service import seed_demo_rides


settings = get_settings()
app = FastAPI(title="LetsGo Ride API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins if settings.cors_origins != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException):
    if isinstance(exc.detail, dict) and "success" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "error": str(exc.detail)},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"success": False, "error": "Validation failed.", "details": exc.errors()},
    )


@app.on_event("startup")
async def on_startup():
    await database.connect()
    if settings.enable_demo_seed:
        await seed_demo_rides()


@app.on_event("shutdown")
async def on_shutdown():
    await database.close()


app.include_router(health.router)
app.include_router(auth.router)
app.include_router(rides.router)
app.include_router(requests.router)
app.include_router(drivers.router)
app.include_router(reports.router)
app.include_router(support.router)
app.include_router(verification.router)
app.include_router(admin.router)
app.include_router(waitlist.router)
