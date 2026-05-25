export type CityCoordinate = {
  latitude: number;
  longitude: number;
};

export const cityCoordinates: Record<string, CityCoordinate> = {
  harare: { latitude: -17.8292, longitude: 31.0522 },
  "harare cbd": { latitude: -17.8318, longitude: 31.0456 },
  bulawayo: { latitude: -20.1325, longitude: 28.6265 },
  mutare: { latitude: -18.9707, longitude: 32.6709 },
  gweru: { latitude: -19.4519, longitude: 29.8167 },
  kwekwe: { latitude: -18.9281, longitude: 29.8149 },
  kadoma: { latitude: -18.3333, longitude: 29.9167 },
  masvingo: { latitude: -20.0637, longitude: 30.8277 },
  chinhoyi: { latitude: -17.3667, longitude: 30.2 },
  marondera: { latitude: -18.1853, longitude: 31.5519 },
  "victoria falls": { latitude: -17.9243, longitude: 25.856 },
  beitbridge: { latitude: -22.2167, longitude: 30 },
};

export function coordinateForPlace(value?: string | null): CityCoordinate | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (cityCoordinates[normalized]) return cityCoordinates[normalized];
  const key = Object.keys(cityCoordinates).find((candidate) => normalized.includes(candidate) || candidate.includes(normalized));
  return key ? cityCoordinates[key] : null;
}
