import { requestData } from "./api";
import {
  GeocodeResult,
  PlaceDetail,
  PlaceSuggestion,
  RouteResult,
  RoutingPoint,
  RoutingStatus,
} from "../types/routing.types";

export function getRoutingStatus() {
  return requestData<RoutingStatus>({ method: "GET", url: "/routing/status" });
}

export function autocompletePlaces(query: string) {
  return requestData<PlaceSuggestion[]>({
    method: "POST",
    url: "/routing/places/autocomplete",
    data: { query },
  });
}

export function getPlaceDetail(placeId: string) {
  return requestData<PlaceDetail>({
    method: "GET",
    url: `/routing/places/${encodeURIComponent(placeId)}`,
  });
}

export function geocodeAddress(address: string) {
  return requestData<GeocodeResult>({
    method: "POST",
    url: "/routing/geocode",
    data: { address },
  });
}

export function reverseGeocodeLocation(location: RoutingPoint) {
  return requestData<GeocodeResult>({
    method: "POST",
    url: "/routing/reverse-geocode",
    data: { location },
  });
}

export function computeRoute(
  origin: RoutingPoint,
  destination: RoutingPoint,
  includePolyline = true,
) {
  return requestData<RouteResult>({
    method: "POST",
    url: "/routing/route",
    data: { origin, destination, include_polyline: includePolyline },
  });
}

export function resolveRoute(payload: {
  origin_address: string;
  destination_address: string;
  origin?: RoutingPoint | null;
  destination?: RoutingPoint | null;
  include_polyline?: boolean;
}) {
  return requestData<RouteResult>({
    method: "POST",
    url: "/routing/resolve-route",
    data: {
      ...payload,
      include_polyline: payload.include_polyline ?? true,
    },
  });
}
