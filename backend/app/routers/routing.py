from fastapi import APIRouter, Depends

from app.auth import get_current_user
from app.models.routing import GeocodeRequestBody, PlaceAutocompleteBody, ResolveRouteRequestBody, RouteRequestBody
from app.services.routing_service import (
    RoutingError,
    RoutingNoResultError,
    RoutingNotConfiguredError,
    autocomplete_places,
    compute_route,
    geocode_address,
    resolve_place,
    resolve_route,
    routing_status,
)
from app.utils import api_error, api_success


router = APIRouter(prefix="/routing", tags=["routing"])


@router.get("/status")
async def route_provider_status(user=Depends(get_current_user)):
    _ = user
    return api_success(routing_status())


@router.post("/places/autocomplete")
async def place_autocomplete(payload: PlaceAutocompleteBody):
    # Place discovery is intentionally public so a new customer can explore the
    # service before authentication. The provider key remains server-side.
    try:
        return api_success(await autocomplete_places(payload.query))
    except RoutingNotConfiguredError as exc:
        api_error(str(exc), 503)
    except RoutingError:
        api_error("Place search is temporarily unavailable.", 502)


@router.get("/places/{place_id}")
async def place_detail(place_id: str):
    try:
        return api_success(await resolve_place(place_id))
    except RoutingNotConfiguredError as exc:
        api_error(str(exc), 503)
    except RoutingNoResultError as exc:
        api_error(str(exc), 404)
    except RoutingError:
        api_error("Place details are temporarily unavailable.", 502)


@router.post("/geocode")
async def geocode(payload: GeocodeRequestBody, user=Depends(get_current_user)):
    _ = user
    try:
        return api_success(await geocode_address(payload.address))
    except RoutingNotConfiguredError as exc:
        api_error(str(exc), 503)
    except RoutingNoResultError as exc:
        api_error(str(exc), 404)
    except RoutingError:
        api_error("Routing is temporarily unavailable.", 502)


@router.post("/route")
async def route(payload: RouteRequestBody, user=Depends(get_current_user)):
    _ = user
    try:
        return api_success(
            await compute_route(
                payload.origin.model_dump(),
                payload.destination.model_dump(),
                include_polyline=payload.include_polyline,
            )
        )
    except RoutingNotConfiguredError as exc:
        api_error(str(exc), 503)
    except RoutingNoResultError as exc:
        api_error(str(exc), 404)
    except RoutingError:
        api_error("Routing is temporarily unavailable.", 502)


@router.post("/resolve-route")
async def resolve_route_from_addresses(
    payload: ResolveRouteRequestBody,
    user=Depends(get_current_user),
):
    _ = user
    try:
        return api_success(
            await resolve_route(
                payload.origin_address,
                payload.destination_address,
                origin=payload.origin.model_dump() if payload.origin else None,
                destination=payload.destination.model_dump() if payload.destination else None,
                include_polyline=payload.include_polyline,
            )
        )
    except RoutingNotConfiguredError as exc:
        api_error(str(exc), 503)
    except RoutingNoResultError as exc:
        api_error(str(exc), 404)
    except RoutingError:
        api_error("Routing is temporarily unavailable.", 502)
