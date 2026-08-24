import asyncio
import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.database import database
from app.routers import admin, auth, conversations, courier, drivers, food, health, media, merchant, notifications, operations, realtime, reports, requests, reviews, rides, routing, support, verification, waitlist
from app.services.auth_service import ensure_admin_seed_user
from app.services.event_service import realtime_event_service
from app.services.ride_service import ride_lifecycle_sweeper, seed_demo_rides
from app.services.staging_courier_dispatch_smoke_service import run_staging_courier_dispatch_smoke_test
from app.services.staging_routing_smoke_service import run_staging_routing_smoke_test
from app.utils import api_success


settings = get_settings()
logger = logging.getLogger(__name__)
app = FastAPI(title="LetsGoRide API", version="0.1.0")
ride_lifecycle_stop_event: asyncio.Event | None = None
ride_lifecycle_task: asyncio.Task | None = None
staging_routing_smoke_task: asyncio.Task | None = None
staging_courier_dispatch_smoke_task: asyncio.Task | None = None

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins if settings.cors_origins != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", include_in_schema=False)
async def root_probe():
    return api_success({"service": "LetsGoRide API", "status": "ok"})


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException):
    if isinstance(exc.detail, dict) and "success" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "error": str(exc.detail)},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    if request.url.path in {"/verification/manual/upload", "/verification/upload"}:
        logger.error(
            "verification_upload stage=form_parse_failed path=%s errors=%s",
            request.url.path,
            exc.errors(),
        )
        return JSONResponse(
            status_code=422,
            content={
                "success": False,
                "stage": "form_parse",
                "error": "Verification upload form validation failed.",
                "details": exc.errors(),
            },
        )
    if request.url.path.startswith("/courier/deliveries/") and request.url.path.endswith("/location"):
        logger.warning(
            "courier_location_validation_failed path=%s errors=%s",
            request.url.path,
            exc.errors(),
        )
        return JSONResponse(
            status_code=422,
            content={
                "success": False,
                "error": "The device location could not be read. Keep moving and try again.",
            },
        )
    return JSONResponse(
        status_code=422,
        content={"success": False, "error": "Validation failed.", "details": exc.errors()},
    )


@app.on_event("startup")
async def on_startup():
    global ride_lifecycle_stop_event, ride_lifecycle_task, staging_routing_smoke_task, staging_courier_dispatch_smoke_task
    await database.connect()
    await realtime_event_service.start()
    await ensure_admin_seed_user()
    if settings.enable_demo_seed:
        await seed_demo_rides()
    ride_lifecycle_stop_event = asyncio.Event()
    ride_lifecycle_task = asyncio.create_task(ride_lifecycle_sweeper(ride_lifecycle_stop_event))
    logger.info(
        "routing_smoke_gate app_env=%s enabled=%s configured=%s provider=%s region=%s",
        settings.app_env,
        settings.routing_staging_smoke_test_enabled,
        settings.routing_configured,
        settings.routing_provider,
        settings.routing_region_code,
    )
    if settings.routing_staging_smoke_test_enabled:
        staging_routing_smoke_task = asyncio.create_task(run_staging_routing_smoke_test())
    logger.info(
        "courier_dispatch_smoke_gate app_env=%s enabled=%s routing_configured=%s pricing_configured=%s",
        settings.app_env,
        settings.courier_dispatch_staging_smoke_test_enabled,
        settings.routing_configured,
        settings.courier_pricing_configured,
    )
    if settings.courier_dispatch_staging_smoke_test_enabled:
        staging_courier_dispatch_smoke_task = asyncio.create_task(run_staging_courier_dispatch_smoke_test())


@app.on_event("shutdown")
async def on_shutdown():
    global ride_lifecycle_stop_event, ride_lifecycle_task, staging_routing_smoke_task, staging_courier_dispatch_smoke_task
    if ride_lifecycle_stop_event:
        ride_lifecycle_stop_event.set()
    if ride_lifecycle_task:
        ride_lifecycle_task.cancel()
    if staging_routing_smoke_task:
        staging_routing_smoke_task.cancel()
    if staging_courier_dispatch_smoke_task:
        staging_courier_dispatch_smoke_task.cancel()
    await realtime_event_service.close()
    await database.close()


app.include_router(health.router)
app.include_router(media.router)
app.include_router(auth.router)
app.include_router(rides.router)
app.include_router(requests.router)
app.include_router(reviews.router)
app.include_router(conversations.router)
app.include_router(notifications.router)
app.include_router(realtime.router)
app.include_router(drivers.router)
app.include_router(courier.router)
app.include_router(food.router)
app.include_router(merchant.router)
app.include_router(operations.router)
app.include_router(routing.router)
app.include_router(reports.router)
app.include_router(support.router)
app.include_router(verification.router)
app.include_router(admin.router)
app.include_router(waitlist.router)
