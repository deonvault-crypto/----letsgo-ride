import { requestData } from "./api";
import {
  GeocodeResult,
  PlaceDetail,
  PlaceSuggestion,
  RouteResult,
  RoutingPoint,
  RoutingStatus,
} from "../types/routing.types";
import { onSessionCleared } from "./sessionLifecycle";

export function getRoutingStatus() {
  return requestData<RoutingStatus>({ method: "GET", url: "/routing/status" });
}

const MAX_SUGGESTION_CACHE_ENTRIES = 20;
const suggestionCache = new Map<string, PlaceSuggestion[]>();

function rememberSuggestions(key: string, suggestions: PlaceSuggestion[]) {
  suggestionCache.delete(key);
  suggestionCache.set(key, suggestions);
  while (suggestionCache.size > MAX_SUGGESTION_CACHE_ENTRIES) {
    const oldestKey = suggestionCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    suggestionCache.delete(oldestKey);
  }
}

export function clearPlaceSuggestionCache() {
  suggestionCache.clear();
}

onSessionCleared(clearPlaceSuggestionCache);

export async function autocompletePlaces(query: string) {
  const clean = query.trim().toLowerCase();
  try {
    const suggestions = await requestData<PlaceSuggestion[]>({
      method: "POST",
      url: "/routing/places/autocomplete",
      data: { query },
    });
    if (suggestions.length) rememberSuggestions(clean, suggestions);
    return suggestions;
  } catch (error) {
    const exact = suggestionCache.get(clean);
    if (exact) return exact;
    const nearby = [...suggestionCache.entries()].find(([key]) => key.startsWith(clean) || clean.startsWith(key))?.[1];
    if (nearby) return nearby;
    throw error;
  }
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
