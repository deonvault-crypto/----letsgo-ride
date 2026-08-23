export type RoutingPoint = {
  latitude: number;
  longitude: number;
};

export type RoutingStatus = {
  provider: string;
  configured: boolean;
  region_code: string;
};

export type PlaceSuggestion = {
  provider: string;
  place_id?: string | null;
  primary_text: string;
  secondary_text?: string;
  description: string;
  location?: RoutingPoint | null;
};

export type PlaceDetail = {
  provider: string;
  place_id?: string | null;
  formatted_address: string;
  display_name?: string;
  location: RoutingPoint;
};

export type GeocodeResult = {
  provider: string;
  formatted_address: string;
  place_id?: string | null;
  location: RoutingPoint;
};

export type RouteResult = {
  provider: string;
  distance_meters: number;
  distance_km: number;
  duration_seconds: number;
  estimated_duration_minutes: number;
  encoded_polyline?: string | null;
  origin: RoutingPoint;
  destination: RoutingPoint;
  origin_address?: string;
  destination_address?: string;
  origin_place_id?: string | null;
  destination_place_id?: string | null;
};
