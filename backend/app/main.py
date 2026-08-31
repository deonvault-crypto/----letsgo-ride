import asyncio
import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.database import database
from app.routers import activity, admin, auth, conversations, courier, drivers, food, hailing, health, media, merchant, notifications, operations, payments, public_tracking, realtime, reports, requests, reviews, rides, routing, support, verification, waitlist, worker_finance
from app.services.auth_service import ensure_admin_seed_user
from app.services.event_service import realtime_event_service
from app.services.hailing_city_service import seed_zimbabwe_service_areas
from app.services.hailing_security_service import clear_legacy_plaintext_hailing_pins
from app.services.hailing_trip_service import hailing_dispatch_sweeper
from app.services.driver_weekly_settlement_service import driver_settlement_sweeper
from app.services.product_hardening_storage_service import ensure_product_hardening_indexes
from app.services.ride_lifecycle_scale_service import ride_lifecycle_sweeper_bounded
from app.services.ride_service import seed_demo_rides
from app.services.staging_courier_dispatch_smoke_service import run_staging_courier_dispatch_smoke_test
from app.services.staging_routing_smoke_service import run_staging_routing_smoke_test
from app.services.stripe_reconciliation_service import stripe_payment_reconciliation_sweeper_bounded
from app.services.worker_finance_index_service import ensure_worker_finance_indexes
from app.utils import api_success


settings = get_settings()
logger = logging.getLogger(__name__)
app = FastAPI(
    title="LetsGoRide API",
    version="0.1.0",
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else "/openapi.json",
)
ride_lifecycle_stop_event: asyncio.Event | None = None
ride_lifecycle_task: asyncio.Task | None = None
hailing_dispatch_stop_event: asyncio.Event | None = None
hailing_dispatch_task: asyncio.Task | None = None
stripe_payment_stop_event: asyncio.Event | None = None
stripe_payment_task: asyncio.Task | None = None
driver_settlement_stop_event: asyncio.Event | None = None
driver_settlement_task: asyncio.Task | None = None
staging_routing_smoke_task: asyncio.Task | None = None
staging_courier_dispatch_smoke_task: asyncio.Task | None = None

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials="*" not in settings.cors_origins,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
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
            "redacted" if settings.is_production else exc.errors(),
        )
        return JSONResponse(
            status_code=422,
            content={
                "success": False,
                "stage": "form_parse",
                "error": "Verification upload form validation failed.",
                **({} if settings.is_production else {"details": exc.errors()}),
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
        content={"success": False, "error": "Validation failed.", **({} if settings.is_production else {"details": exc.errors()})},
    )


@app.on_event("startup")
async def on_startup():
    global ride_lifecycle_stop_event, ride_lifecycle_task, hailing_dispatch_stop_event, hailing_dispatch_task, stripe_payment_stop_event, stripe_payment_task, driver_settlement_stop_event, driver_settlement_task, staging_routing_smoke_task, staging_courier_dispatch_smoke_task
    await database.connect()
    await ensure_product_hardening_indexes()
    await ensure_worker_finance_indexes()
    await realtime_event_service.start()
    await ensure_admin_seed_user()
    driver_settlement_stop_event = asyncio.Event()
    driver_settlement_task = asyncio.create_task(driver_settlement_sweeper(driver_settlement_stop_event))
    if settings.enable_demo_seed:
        await seed_demo_rides()
    ride_lifecycle_stop_event = asyncio.Event()
    ride_lifecycle_task = asyncio.create_task(ride_lifecycle_sweeper_bounded(ride_lifecycle_stop_event))
    if settings.hailing_enabled:
        await seed_zimbabwe_service_areas()
        await clear_legacy_plaintext_hailing_pins()
        hailing_dispatch_stop_event = asyncio.Event()
        # Preserve the Codex-hardened/native Ride Now dispatch worker. It already
        # uses next_dispatch_at and bounded indexed due-work queries.
        hailing_dispatch_task = asyncio.create_task(hailing_dispatch_sweeper(hailing_dispatch_stop_event))
        logger.info("hailing_runtime enabled=true bounded_dispatch=true")
    else:
        hailing_dispatch_stop_event = None
        hailing_dispatch_task = None
        logger.info("hailing_runtime enabled=false dispatch_sweeper_started=false")
    if settings.stripe_configured:
        stripe_payment_stop_event = asyncio.Event()
        stripe_payment_task = asyncio.create_task(
            stripe_payment_reconciliation_sweeper_bounded(stripe_payment_stop_event)
        )
        logger.info(
            "stripe_payment_runtime enabled=true account_id=%s bounded_reconciliation=true",
            settings.stripe_account_id or "configured",
        )
    else:
        stripe_payment_stop_event = None
        stripe_payment_task = None
        logger.info("stripe_payment_runtime enabled=false")
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
    global ride_lifecycle_stop_event, ride_lifecycle_task, hailing_dispatch_stop_event, hailing_dispatch_task, stripe_payment_stop_event, stripe_payment_task, driver_settlement_stop_event, driver_settlement_task, staging_routing_smoke_task, staging_courier_dispatch_smoke_task
    if ride_lifecycle_stop_event:
        ride_lifecycle_stop_event.set()
    if ride_lifecycle_task:
        ride_lifecycle_task.cancel()
    if hailing_dispatch_stop_event:
        hailing_dispatch_stop_event.set()
    if hailing_dispatch_task:
        hailing_dispatch_task.cancel()
    if stripe_payment_stop_event:
        stripe_payment_stop_event.set()
    if stripe_payment_task:
        stripe_payment_task.cancel()
    if driver_settlement_stop_event:
        driver_settlement_stop_event.set()
    if driver_settlement_task:
        driver_settlement_task.cancel()
    if staging_routing_smoke_task:
        staging_routing_smoke_task.cancel()
    if staging_courier_dispatch_smoke_task:
        staging_courier_dispatch_smoke_task.cancel()
    await realtime_event_service.close()
    await database.close()


app.include_router(health.router)
app.include_router(media.router)
app.include_router(auth.router)
app.include_router(activity.router)
app.include_router(rides.router)
app.include_router(requests.router)
app.include_router(reviews.router)
app.include_router(conversations.router)
app.include_router(notifications.router)
app.include_router(realtime.router)
app.include_router(drivers.router)
app.include_router(hailing.router)
app.include_router(hailing.admin_router)
app.include_router(payments.router)
app.include_router(public_tracking.router)
app.include_router(courier.router)
app.include_router(food.router)
app.include_router(merchant.router)
app.include_router(operations.router)
app.include_router(worker_finance.router)
app.include_router(worker_finance.admin_router)
app.include_router(routing.router)
app.include_router(reports.router)
app.include_router(support.router)
app.include_router(verification.router)
app.include_router(admin.router)
app.include_router(waitlist.router)
