export type MapCoordinate = { latitude: number; longitude: number };
export type LocationSample = MapCoordinate & { heading?: number | null; updated_at?: string | null; recorded_at?: string | null };

const CONTINUOUS_FIX_WINDOW_MS = 15_000;
const MAX_ANIMATED_DISTANCE_METERS = 250;

export function isMapCoordinate(point?: { latitude?: number | null; longitude?: number | null } | null): point is MapCoordinate {
  return typeof point?.latitude === "number" && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90
    && typeof point?.longitude === "number" && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180;
}

export function sampleTime(sample: LocationSample): number | null {
  const value = sample.updated_at || sample.recorded_at;
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : null;
}

export function nearestHeading(previous: number, heading?: number | null): number {
  if (typeof heading !== "number" || !Number.isFinite(heading) || heading < 0 || heading >= 360) return previous;
  return previous + ((heading - previous + 540) % 360 + 360) % 360 - 180;
}

export function markerMotionDuration(previous: LocationSample | null, next: LocationSample, elapsed: number, now: number): number {
  if (!previous || elapsed > CONTINUOUS_FIX_WINDOW_MS || elapsed < 0) return 0;
  if (Math.abs(next.longitude - previous.longitude) > 180) return 0;
  const previousTime = sampleTime(previous);
  const nextTime = sampleTime(next);
  if (nextTime !== null && (now - nextTime > CONTINUOUS_FIX_WINDOW_MS || nextTime > now + 1000)) return 0;
  if (previousTime !== null && nextTime !== null && (nextTime <= previousTime || nextTime - previousTime > CONTINUOUS_FIX_WINDOW_MS)) return 0;
  // Short interpolation between received fixes only. Gaps and GPS corrections
  // snap to the latest position instead of showing a fictional journey.
  const latitude = (next.latitude - previous.latitude) * Math.PI / 180;
  const longitude = (next.longitude - previous.longitude) * Math.PI / 180;
  const a = Math.sin(latitude / 2) ** 2 + Math.cos(previous.latitude * Math.PI / 180)
    * Math.cos(next.latitude * Math.PI / 180) * Math.sin(longitude / 2) ** 2;
  const distance = 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return distance <= MAX_ANIMATED_DISTANCE_METERS ? 600 : 0;
}
