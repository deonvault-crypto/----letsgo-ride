import asyncio
import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.database import database
from app.routers import communications, activity, admin, admin_profile_photos, auth, conversations, courier, courier_presence, drivers, food, hailing, health, media, merchant, notifications, operations, ops, ops_live_map, payments, public_tracking, realtime, reports, requests, reviews, rides, routing, support, support_conversations, support_message_management, verification, worker_finance
from app.services.auth_service import ensure_admin_seed_user
from app.services.event_service import realtime_event_service
from app.services.hailing_city_service import seed_zimbabwe_service_areas
from app.services.hailing_security_service import clear_legacy_plaintext_hailing_pins
from app.services.hailing_trip_service import hailing_dispatch_sweeper
from app.services.driver_weekly_settlement_service import driver_settlement_sweeper
from app.services.product_hardening_storage_service import ensure_product_hardening_indexes
from app.services.ride_lifecycle_scale_service import ride_lifecycle_sweeper_bounded
from app.services.stripe_reconciliation_service import stripe_payment_reconciliation_sweeper_bounded
from app.services.stripe_runtime_guard import StripeVerificationUnavailable, ensure_stripe_runtime_binding
from app.services.worker_finance_index_service import ensure_worker_finance_indexes
from app.services.communications_service import communications_worker, ensure_communications_indexes
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

communications_stop_event: asyncio.Event | None = None
communications_task: asyncio.Task | None = None

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
    global ride_lifecycle_stop_event, ride_lifecycle_task, hailing_dispatch_stop_event, hailing_dispatch_task, stripe_payment_stop_event, stripe_payment_task, driver_settlement_stop_event, driver_settlement_task
    await database.connect()
    await ensure_product_hardening_indexes()
    await ensure_worker_finance_indexes()
    await ensure_communications_indexes()
    global communications_stop_event, communications_task
    await realtime_event_service.start()
    await ensure_admin_seed_user()
    if settings.stripe_configured:
        # Wrong live-account identity is a fatal configuration error and still
        # bubbles out. A temporary Stripe outage only degrades payment features;
        # cash Ride Now, Courier and Admin must remain available.
        try:
            await ensure_stripe_runtime_binding()
        except StripeVerificationUnavailable as exc:
            logger.error("stripe_runtime_degraded_on_startup error_type=%s", exc.__class__.__name__)
    driver_settlement_stop_event = asyncio.Event()
    driver_settlement_task = asyncio.create_task(driver_settlement_sweeper(driver_settlement_stop_event))
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

    communications_stop_event = asyncio.Event()
    communications_task = asyncio.create_task(communications_worker(communications_stop_event))


@app.on_event("shutdown")
async def on_shutdown():
    global ride_lifecycle_stop_event, ride_lifecycle_task, hailing_dispatch_stop_event, hailing_dispatch_task, stripe_payment_stop_event, stripe_payment_task, driver_settlement_stop_event, driver_settlement_task
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
    if communications_stop_event:
        communications_stop_event.set()
    if communications_task:
        communications_task.cancel()
        await asyncio.gather(communications_task, return_exceptions=True)
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
app.include_router(communications.router)
app.include_router(realtime.router)
app.include_router(drivers.router)
app.include_router(hailing.router)
app.include_router(hailing.admin_router)
app.include_router(payments.router)
app.include_router(public_tracking.router)
app.include_router(courier.router)
app.include_router(courier_presence.router)
app.include_router(food.router)
app.include_router(merchant.router)
app.include_router(operations.router)
app.include_router(worker_finance.router)
app.include_router(worker_finance.admin_router)
app.include_router(routing.router)
app.include_router(reports.router)
app.include_router(support.router)
app.include_router(support_conversations.router)
app.include_router(support_message_management.router)
app.include_router(verification.router)
app.include_router(ops.router)
app.include_router(ops_live_map.router)
app.include_router(admin.router)
app.include_router(admin_profile_photos.router)
