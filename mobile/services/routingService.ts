import { requestData } from "./api";
import { GeocodeResult, RouteResult, RoutingPoint, RoutingStatus } from "../types/routing.types";

export function getRoutingStatus() {
  return requestData<RoutingStatus>({ method: "GET", url: "/routing/status" });
}

export function geocodeAddress(address: string) {
  return requestData<GeocodeResult>({
    method: "POST",
    url: "/routing/geocode",
    data: { address },
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
