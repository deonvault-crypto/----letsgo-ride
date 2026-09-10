from __future__ import annotations

import asyncio
import logging
import os
import secrets
import socket
from datetime import datetime, timedelta, timezone
from typing import Awaitable, Callable

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.config import get_settings
from app.database import database
from app.services.communications_service import communications_worker
from app.services.driver_weekly_settlement_service import driver_settlement_sweeper
from app.services.hailing_trip_service import hailing_dispatch_sweeper
from app.services.ride_lifecycle_scale_service import ride_lifecycle_sweeper_bounded
from app.services.stripe_reconciliation_service import stripe_payment_reconciliation_sweeper_bounded


logger = logging.getLogger(__name__)

LEASE_COLLECTION = "runtime_worker_leases"
LEASE_ID = "backend-background-workers:v1"
LEASE_TTL_SECONDS = 45
LEASE_RENEW_SECONDS = 15
LEASE_RETRY_SECONDS = 5
WORKER_SHUTDOWN_GRACE_SECONDS = 5

Worker = Callable[[asyncio.Event], Awaitable[None]]

# Memory storage is used only outside production, but registering the collection
# keeps local/test behavior consistent with the rest of the database facade.
database.memory.setdefault(LEASE_COLLECTION, [])


def _owner_id() -> str:
    instance = os.getenv("RENDER_INSTANCE_ID", "").strip() or socket.gethostname() or "local"
    return f"{instance}:{os.getpid()}:{secrets.token_hex(6)}"


OWNER_ID = _owner_id()


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _wait_for_stop(stop_event: asyncio.Event, timeout: float) -> bool:
    try:
        await asyncio.wait_for(stop_event.wait(), timeout=timeout)
        return True
    except asyncio.TimeoutError:
        return False


async def _acquire_lease(owner_id: str) -> bool:
    """Acquire the singleton worker lease without stealing an unexpired owner."""
    if database.db is None:
        # Development/test storage is process-local, so there is no distributed
        # lease to coordinate. Production always requires persistent MongoDB.
        return True

    now = _now()
    expires_at = now + timedelta(seconds=LEASE_TTL_SECONDS)
    collection = database.db[LEASE_COLLECTION]
    try:
        item = await collection.find_one_and_update(
            {
                "_id": LEASE_ID,
                "$or": [
                    {"owner_id": owner_id},
                    {"expires_at": {"$lte": now}},
                    {"expires_at": {"$exists": False}},
                ],
            },
            {
                "$set": {
                    "owner_id": owner_id,
                    "expires_at": expires_at,
                    "updated_at": now,
                },
                "$setOnInsert": {"created_at": now},
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError:
        # Another instance owns the same immutable _id and its lease is active.
        return False
    return bool(item and item.get("owner_id") == owner_id)


async def _renew_lease(owner_id: str) -> bool:
    if database.db is None:
        return True
    now = _now()
    item = await database.db[LEASE_COLLECTION].find_one_and_update(
        {"_id": LEASE_ID, "owner_id": owner_id},
        {
            "$set": {
                "expires_at": now + timedelta(seconds=LEASE_TTL_SECONDS),
                "updated_at": now,
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    return bool(item and item.get("owner_id") == owner_id)


async def _release_lease(owner_id: str) -> None:
    if database.db is None:
        return
    try:
        await database.db[LEASE_COLLECTION].delete_one({"_id": LEASE_ID, "owner_id": owner_id})
    except Exception as exc:
        # The TTL still permits takeover even if graceful release fails.
        logger.warning("background_worker_lease_release_failed error_type=%s", exc.__class__.__name__)


def _worker_specs() -> list[tuple[str, Worker]]:
    settings = get_settings()
    workers: list[tuple[str, Worker]] = [
        ("driver_settlement", driver_settlement_sweeper),
        ("ride_lifecycle", ride_lifecycle_sweeper_bounded),
        ("communications", communications_worker),
    ]
    if settings.hailing_enabled:
        workers.append(("hailing_dispatch", hailing_dispatch_sweeper))
    if settings.stripe_configured:
        workers.append(("stripe_reconciliation", stripe_payment_reconciliation_sweeper_bounded))
    return workers


async def _stop_workers(
    worker_stop_events: dict[str, asyncio.Event],
    worker_tasks: dict[str, asyncio.Task],
) -> None:
    for event in worker_stop_events.values():
        event.set()
    if not worker_tasks:
        return

    done, pending = await asyncio.wait(
        list(worker_tasks.values()),
        timeout=WORKER_SHUTDOWN_GRACE_SECONDS,
    )
    for task in pending:
        task.cancel()
    if pending:
        await asyncio.gather(*pending, return_exceptions=True)
    # Consume any completed worker exceptions so asyncio does not report them as
    # un-retrieved; the supervisor logs unexpected exits before shutdown.
    for task in done:
        if not task.cancelled():
            try:
                task.exception()
            except asyncio.CancelledError:
                pass


async def _run_owned_workers(stop_event: asyncio.Event, owner_id: str) -> None:
    worker_stop_events: dict[str, asyncio.Event] = {}
    worker_tasks: dict[str, asyncio.Task] = {}
    for name, worker in _worker_specs():
        worker_stop = asyncio.Event()
        worker_stop_events[name] = worker_stop
        worker_tasks[name] = asyncio.create_task(worker(worker_stop), name=f"letsgoride:{name}")

    logger.info(
        "background_worker_lease_acquired worker_count=%s distributed=%s",
        len(worker_tasks),
        database.db is not None,
    )

    try:
        while not stop_event.is_set():
            exited = [name for name, task in worker_tasks.items() if task.done()]
            if exited:
                for name in exited:
                    task = worker_tasks[name]
                    error_type = "none"
                    if not task.cancelled():
                        try:
                            exc = task.exception()
                            error_type = exc.__class__.__name__ if exc else "none"
                        except asyncio.CancelledError:
                            error_type = "CancelledError"
                    logger.error(
                        "background_worker_exited worker=%s error_type=%s",
                        name,
                        error_type,
                    )
                break

            if await _wait_for_stop(stop_event, LEASE_RENEW_SECONDS):
                break

            try:
                renewed = await _renew_lease(owner_id)
            except Exception as exc:
                logger.warning(
                    "background_worker_lease_renew_failed error_type=%s",
                    exc.__class__.__name__,
                )
                renewed = False
            if not renewed:
                logger.warning("background_worker_lease_lost")
                break
    finally:
        await _stop_workers(worker_stop_events, worker_tasks)
        await _release_lease(owner_id)
        logger.info("background_worker_lease_released")


async def background_worker_supervisor(stop_event: asyncio.Event) -> None:
    """Run periodic backend workers on exactly one healthy instance at a time.

    All web instances remain available for HTTP and realtime traffic. In production,
    MongoDB's immutable lease document elects one worker owner. Followers retry at a
    bounded cadence and take over after lease expiry if the owner disappears.
    """
    owner_id = OWNER_ID
    while not stop_event.is_set():
        try:
            acquired = await _acquire_lease(owner_id)
        except Exception as exc:
            logger.warning(
                "background_worker_lease_acquire_failed error_type=%s",
                exc.__class__.__name__,
            )
            acquired = False

        if acquired:
            await _run_owned_workers(stop_event, owner_id)
            if stop_event.is_set():
                break

        await _wait_for_stop(stop_event, LEASE_RETRY_SECONDS)
