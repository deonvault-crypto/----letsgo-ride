from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request

from app.auth import get_admin_user, get_current_user
from app.config import get_settings
from app.database import database
from app.models.hailing import (
    HailingCancelBody,
    HailingCityUpsertBody,
    HailingDriverEligibilityBody,
    HailingDriverOnlineBody,
    HailingDriverPresenceBody,
    HailingQuoteBody,
    HailingSafetyEventBody,
    HailingTripCreateBody,
    HailingTripLocationBody,
    HailingVerifyPinBody,
    ServiceAreaResolveBody,
)
from app.services.audit_service import write_audit_log
from app.services.conversation_service import ensure_conversation_for_hailing_trip, enrich_conversation
from app.services.driver_hailing_finance_service import driver_daily_stats
from app.services.hailing_city_service import (
    enabled_ride_classes,
    list_service_areas,
    public_city,
    resolve_service_area,
    upsert_city,
)
from app.services.hailing_fare_service import create_quote
from app.services.hailing_trip_service import (
    accept_offer,
    active_trip_for_user,
    cancel_trip,
    confirm_passenger_boarding,
    complete_trip,
    current_driver_offer,
    decline_offer,
    driver_go_offline,
    driver_go_online,
    driver_profile_for_user,
    get_authorized_trip,
    mark_arrived,
    public_trip,
    record_safety_event,
    regenerate_trip_pin,
    start_trip,
    update_driver_presence,
    update_trip_location,
    verify_trip_pin,
)
from app.services.rate_limit_service import RateLimit, rate_limit_service
from app.utils import api_error, api_success, now_iso


router = APIRouter(prefix="/hailing", tags=["hailing"])


def _require_hailing_enabled() -> None:
    if not get_settings().hailing_enabled:
        api_error("Ride Now is not available yet.", 503)


def _hailing_config_payload() -> dict:
    settings = get_settings()
    return {
        "enabled": bool(settings.hailing_enabled),
        "currency": "USD",
        "ride_classes": [
            {"id": "ECONOMY", "label": "Economy", "enabled": True},
            {"id": "COMFORT", "label": "Comfort", "enabled": True},
            {"id": "XL", "label": "XL", "enabled": True},
        ],
        "cash_enabled": True,
        "digital_payments": [],
    }


@router.get("/config")
async def hailing_config():
    return api_success(_hailing_config_payload())


@router.get("/cities")
async def hailing_cities():
    _require_hailing_enabled()
    cities = await list_service_areas()
    return api_success([public_city(city) for city in cities])


@router.post("/service-area/resolve")
async def resolve_area(payload: ServiceAreaResolveBody, request: Request):
    _require_hailing_enabled()
    await rate_limit_service.enforce(request, "hailing-service-area-resolve", RateLimit(60, 60))
    return api_success(await resolve_service_area(payload.latitude, payload.longitude))


@router.post("/quotes")
async def quote(payload: HailingQuoteBody, request: Request, user=Depends(get_current_user)):
    _require_hailing_enabled()
    await rate_limit_service.enforce(request, "hailing-quotes", RateLimit(20, 300), identity=str(user.get("id") or ""))
    try:
        return api_success(await create_quote(payload.model_dump(), user))
    except RuntimeError as exc:
        api_error(str(exc), 502)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.post("/trips")
async def create_trip(payload: HailingTripCreateBody, request: Request, user=Depends(get_current_user)):
    _require_hailing_enabled()
    await rate_limit_service.enforce(request, "hailing-trip-create", RateLimit(8, 300), identity=str(user.get("id") or ""))
    try:
        from app.services.hailing_trip_service import create_trip_from_quote

        return api_success(await create_trip_from_quote(payload.model_dump(), user))
    except PermissionError as exc:
        api_error(str(exc), 503)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.get("/trips/active")
async def active_trip(user=Depends(get_current_user)):
    _require_hailing_enabled()
    trip = await active_trip_for_user(user)
    return api_success(public_trip(trip, user) if trip else None)


@router.get("/trips/{trip_id}")
async def trip_detail(trip_id: str, user=Depends(get_current_user)):
    _require_hailing_enabled()
    try:
        return api_success(public_trip(await get_authorized_trip(trip_id, user), user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 404)


@router.post("/trips/{trip_id}/conversation")
async def trip_conversation(trip_id: str, user=Depends(get_current_user)):
    _require_hailing_enabled()
    try:
        trip = await get_authorized_trip(trip_id, user)
        conversation = await ensure_conversation_for_hailing_trip(trip)
        return api_success(await enrich_conversation(conversation, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 404)


@router.post("/trips/{trip_id}/cancel")
async def cancel(trip_id: str, payload: HailingCancelBody, user=Depends(get_current_user)):
    _require_hailing_enabled()
    try:
        return api_success(await cancel_trip(trip_id, payload.reason, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.get("/driver/status")
async def driver_status(user=Depends(get_current_user)):
    _require_hailing_enabled()
    try:
        driver = await driver_profile_for_user(user)
    except PermissionError as exc:
        api_error(str(exc), 403)
    presence = await database.find_one("hailing_driver_presence", {"driver_id": driver["id"]})
    active = await active_trip_for_user(user)
    stats = await driver_daily_stats(str(driver["id"]))
    return api_success({
        "driver_id": driver["id"],
        "online": bool(presence and presence.get("status") != "offline"),
        "presence": presence,
        "active_trip": public_trip(active, user) if active else None,
        "stats": {
            "rides_today": stats["today_ride_count"],
            "gross_fares": stats["today_gross_fares"],
            "platform_commission": stats["today_platform_commission"],
            "estimated_net": stats["today_estimated_earnings"],
            "online_minutes": 0,
        },
    })


@router.post("/driver/online")
async def driver_online(payload: HailingDriverOnlineBody, request: Request, user=Depends(get_current_user)):
    _require_hailing_enabled()
    await rate_limit_service.enforce(request, "hailing-driver-online", RateLimit(20, 300), identity=str(user.get("id") or ""))
    try:
        return api_success(await driver_go_online(payload.model_dump(), user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.post("/driver/offline")
async def driver_offline(user=Depends(get_current_user)):
    _require_hailing_enabled()
    try:
        return api_success(await driver_go_offline(user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.post("/driver/presence")
async def driver_presence(payload: HailingDriverPresenceBody, request: Request, user=Depends(get_current_user)):
    _require_hailing_enabled()
    await rate_limit_service.enforce(request, "hailing-driver-presence", RateLimit(30, 60), identity=str(user.get("id") or ""))
    try:
        return api_success(await update_driver_presence(payload.model_dump(), user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.get("/driver/offer")
async def driver_offer(user=Depends(get_current_user)):
    _require_hailing_enabled()
    try:
        return api_success(await current_driver_offer(user))
    except PermissionError as exc:
        api_error(str(exc), 403)


@router.post("/offers/{offer_id}/accept")
async def offer_accept(offer_id: str, request: Request, user=Depends(get_current_user)):
    _require_hailing_enabled()
    await rate_limit_service.enforce(request, "hailing-offer-accept", RateLimit(30, 300), identity=str(user.get("id") or ""))
    try:
        return api_success(await accept_offer(offer_id, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 409 if "already" in str(exc).lower() else 400)


@router.post("/offers/{offer_id}/decline")
async def offer_decline(offer_id: str, user=Depends(get_current_user)):
    _require_hailing_enabled()
    try:
        return api_success(await decline_offer(offer_id, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.post("/trips/{trip_id}/arrived")
async def arrived(trip_id: str, user=Depends(get_current_user)):
    _require_hailing_enabled()
    try:
        return api_success(await mark_arrived(trip_id, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.post("/trips/{trip_id}/verify-pin")
async def verify_pin(trip_id: str, payload: HailingVerifyPinBody, request: Request, user=Depends(get_current_user)):
    _require_hailing_enabled()
    await rate_limit_service.enforce(request, "hailing-pin-verify", RateLimit(8, 300), identity=f"{user.get('id')}:{trip_id}")
    try:
        return api_success(await verify_trip_pin(trip_id, payload.pin, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.post("/trips/{trip_id}/confirm-boarding")
async def confirm_boarding(trip_id: str, user=Depends(get_current_user)):
    _require_hailing_enabled()
    try:
        return api_success(await confirm_passenger_boarding(trip_id, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.post("/trips/{trip_id}/regenerate-pin")
async def regenerate_pin(trip_id: str, request: Request, user=Depends(get_current_user)):
    _require_hailing_enabled()
    await rate_limit_service.enforce(request, "hailing-pin-regenerate", RateLimit(4, 300), identity=f"{user.get('id')}:{trip_id}")
    try:
        return api_success(await regenerate_trip_pin(trip_id, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.post("/trips/{trip_id}/start")
async def start(trip_id: str, user=Depends(get_current_user)):
    _require_hailing_enabled()
    try:
        return api_success(await start_trip(trip_id, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.post("/trips/{trip_id}/location")
async def trip_location(trip_id: str, payload: HailingTripLocationBody, user=Depends(get_current_user)):
    _require_hailing_enabled()
    try:
        return api_success(await update_trip_location(trip_id, payload.model_dump(), user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.post("/trips/{trip_id}/complete")
async def complete(trip_id: str, user=Depends(get_current_user)):
    _require_hailing_enabled()
    try:
        return api_success(await complete_trip(trip_id, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.post("/trips/{trip_id}/safety-event")
async def safety_event(trip_id: str, payload: HailingSafetyEventBody, request: Request, user=Depends(get_current_user)):
    _require_hailing_enabled()
    await rate_limit_service.enforce(request, "hailing-safety-event", RateLimit(10, 3600), identity=str(user.get("id") or ""))
    try:
        return api_success(await record_safety_event(trip_id, payload.model_dump(), user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 404)


admin_router = APIRouter(prefix="/admin/hailing", tags=["admin-hailing"])


def _admin_city_payload(city: dict) -> dict:
    return {**public_city(city), "pricing": city.get("pricing") or {}, "dispatch": city.get("dispatch") or {}}


def _hailing_driver_payload(driver: dict, presence: dict | None = None) -> dict:
    return {
        "id": driver.get("id"),
        "user_id": driver.get("user_id"),
        "name": driver.get("name"),
        "city": driver.get("city"),
        "verified": bool(driver.get("verified")),
        "verification_status": driver.get("verification_status"),
        "status": driver.get("status"),
        "hailing_enabled": driver.get("hailing_enabled") is True,
        "approved_hailing_city_ids": driver.get("approved_hailing_city_ids") or [],
        "approved_hailing_classes": driver.get("approved_hailing_classes") or [],
        "current_presence": {
            "status": presence.get("status"),
            "city_id": presence.get("city_id"),
            "ride_class": presence.get("ride_class"),
            "last_seen_at": presence.get("last_seen_at"),
            "last_location_at": presence.get("last_location_at"),
        } if presence else None,
    }


@admin_router.get("/cities")
async def admin_cities(user=Depends(get_admin_user)):
    _ = user
    return api_success([_admin_city_payload(city) for city in await list_service_areas(include_disabled=True)])


@admin_router.post("/cities")
async def admin_upsert_city(payload: HailingCityUpsertBody, user=Depends(get_admin_user)):
    try:
        city = await upsert_city(payload.model_dump(exclude_unset=True), user)
    except ValueError as exc:
        api_error(str(exc), 400)
    await write_audit_log(
        actor_user_id=user.get("id"),
        actor_role=user.get("role"),
        action="hailing_city_upserted",
        target_type="hailing_city",
        target_id=city["id"],
        metadata={
            "enabled": city.get("enabled"),
            "ride_classes": enabled_ride_classes(city),
            "pricing_updated": True,
            "dispatch_updated": True,
        },
    )
    return api_success(_admin_city_payload(city))


@admin_router.get("/drivers")
async def admin_hailing_drivers(
    limit: int = Query(default=100, ge=1, le=250),
    offset: int = Query(default=0, ge=0, le=5000),
    user=Depends(get_admin_user),
):
    _ = user
    fetch_limit = offset + limit
    drivers = await database.find_many(
        "drivers",
        sort=[("name", 1), ("created_at", -1)],
        limit=fetch_limit,
    )
    drivers = drivers[offset:offset + limit]
    driver_ids = [str(driver.get("id")) for driver in drivers if driver.get("id")]
    presences = (
        await database.find_many(
            "hailing_driver_presence",
            {"driver_id": {"$in": driver_ids}},
            limit=len(driver_ids),
        )
        if driver_ids
        else []
    )
    presence_by_driver = {str(presence.get("driver_id")): presence for presence in presences}
    rows = [
        _hailing_driver_payload(driver, presence_by_driver.get(str(driver.get("id"))))
        for driver in drivers
    ]
    return api_success(rows)


@admin_router.patch("/drivers/{driver_id}/eligibility")
async def admin_update_hailing_driver(driver_id: str, payload: HailingDriverEligibilityBody, user=Depends(get_admin_user)):
    driver = await database.find_one("drivers", {"id": driver_id})
    if not driver:
        api_error("Driver not found.", 404)
    if payload.hailing_enabled and not payload.approved_hailing_classes:
        api_error("Ride Now drivers require at least one approved ride class.", 400)

    enabled_cities = [
        city for city in await list_service_areas()
        if city.get("ride_hailing_enabled")
    ]
    nationwide_city_ids = [str(city["id"]) for city in enabled_cities if city.get("id")]
    if payload.hailing_enabled and not nationwide_city_ids:
        api_error("Ride Now has no enabled Zimbabwe service areas.", 400)

    approved_city_ids = nationwide_city_ids if payload.hailing_enabled else payload.approved_hailing_city_ids
    updates = {
        "hailing_enabled": payload.hailing_enabled,
        # City IDs remain in the stored schema for backward compatibility, but an
        # enabled Ride Now Driver is approved across every enabled Zimbabwe area.
        "approved_hailing_city_ids": approved_city_ids,
        "approved_hailing_classes": payload.approved_hailing_classes,
        "updated_at": now_iso(),
    }
    updated = await database.update_one("drivers", driver_id, updates)
    await write_audit_log(
        actor_user_id=user.get("id"),
        actor_role=user.get("role"),
        action="hailing_driver_eligibility_update",
        target_type="driver",
        target_id=driver_id,
        metadata={
            "hailing_enabled": payload.hailing_enabled,
            "coverage": "Zimbabwe nationwide" if payload.hailing_enabled else "disabled",
            "approved_hailing_city_count": len(approved_city_ids),
            "approved_hailing_classes": payload.approved_hailing_classes,
        },
    )
    presence = await database.find_one("hailing_driver_presence", {"driver_id": driver_id})
    return api_success(_hailing_driver_payload(updated or {**driver, **updates}, presence))


@admin_router.get("/trips")
async def admin_trips(
    limit: int = Query(default=100, ge=1, le=250),
    offset: int = Query(default=0, ge=0, le=5000),
    user=Depends(get_admin_user),
):
    fetch_limit = offset + limit
    trips = await database.find_many(
        "hailing_trips",
        sort=[("created_at", -1)],
        limit=fetch_limit,
    )
    trips = trips[offset:offset + limit]
    return api_success([public_trip(trip, user) for trip in trips])


@admin_router.post("/trips/{trip_id}/cancel")
async def admin_cancel_trip(trip_id: str, payload: HailingCancelBody, user=Depends(get_admin_user)):
    try:
        return api_success(await cancel_trip(trip_id, payload.reason, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)
