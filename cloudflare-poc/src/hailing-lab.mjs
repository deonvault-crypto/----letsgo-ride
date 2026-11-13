const EARTH_RADIUS_KM = 6371.0088;
const radians = degrees => degrees * Math.PI / 180;
const degrees = angle => angle * 180 / Math.PI;

export async function nearbyDrivers(db, { tripId, radiusKm, now, staleMs = 75_000, limit = 16 }) {
  if (!Number.isFinite(radiusKm) || radiusKm < 0.25 || radiusKm > 80 ||
      !Number.isSafeInteger(now) || !Number.isSafeInteger(staleMs) || staleMs < 10_000 || staleMs > 300_000 ||
      !Number.isInteger(limit) || limit < 1 || limit > 40) {
    throw new RangeError('Invalid dispatch bounds');
  }
  const trip = await db.prepare(`
    SELECT ride_class, pickup_latitude, pickup_longitude
    FROM lab_trips WHERE id = ? AND status = 'SEARCHING' AND search_expires_ms > ?
  `).bind(tripId, now).first();
  if (!trip) return [];

  const { pickup_latitude: lat, pickup_longitude: lon } = trip;
  const angularRadius = radiusKm / EARTH_RADIUS_KM;
  const latDelta = degrees(angularRadius);
  const minLat = Math.max(-90, lat - latDelta);
  const maxLat = Math.min(90, lat + latDelta);
  const lonDelta = minLat === -90 || maxLat === 90
    ? 180
    : degrees(Math.asin(Math.min(1, Math.sin(angularRadius) / Math.cos(radians(lat)))));
  const minLon = lon - lonDelta;
  const maxLon = lon + lonDelta;
  const maxHaversine = Math.sin(angularRadius / 2) ** 2;
  const { results } = await db.prepare(`
    WITH candidates AS (
      SELECT d.id,
        sin((d.latitude - ?1) * ?14) AS lat_sine,
        sin((d.longitude - ?2) * ?14) AS lon_sine,
        cos(d.latitude * ?15) AS lat_cosine
      FROM lab_drivers AS d
      WHERE d.ride_class = ?3 AND d.approved = 1 AND d.available = 1
        AND d.last_seen_ms BETWEEN ?4 AND ?5
        AND d.latitude BETWEEN ?6 AND ?7
        AND (d.longitude BETWEEN ?8 AND ?9 OR d.longitude BETWEEN ?8 + 360 AND ?9 + 360
          OR d.longitude BETWEEN ?8 - 360 AND ?9 - 360)
        AND NOT EXISTS (SELECT 1 FROM lab_dispatch_offers o WHERE o.driver_id = d.id AND o.trip_id = ?10)
        AND NOT EXISTS (SELECT 1 FROM lab_dispatch_offers o WHERE o.driver_id = d.id AND o.status = 'pending')
        AND NOT EXISTS (SELECT 1 FROM lab_trips t WHERE t.driver_id = d.id
          AND t.status IN ('DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'PASSENGER_CONFIRMED_BOARDING', 'IN_PROGRESS'))
    ), ranked AS (
      SELECT id, lat_sine * lat_sine + ?11 * lat_cosine * lon_sine * lon_sine AS haversine
      FROM candidates
    )
    SELECT id, haversine FROM ranked WHERE haversine <= ?12 ORDER BY haversine, id LIMIT ?13
  `).bind(lat, lon, trip.ride_class, now - staleMs, now, minLat, maxLat, minLon, maxLon,
    tripId, Math.cos(radians(lat)), maxHaversine, limit, Math.PI / 360, Math.PI / 180).all();
  return results.map(({ id, haversine }) => ({
    id, pickup_distance_km: 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(haversine, 1))),
  }));
}

export async function reserveOffer(db, { tripId, driverId, now, timeoutMs = 25_000, staleMs = 75_000 }) {
  return db.prepare(`
    INSERT INTO lab_dispatch_offers (id, trip_id, driver_id, status, expires_ms)
    SELECT ?1, t.id, d.id, 'pending', min(?2 + ?3, t.search_expires_ms)
    FROM lab_trips t JOIN lab_drivers d ON d.id = ?5 AND d.ride_class = t.ride_class
    WHERE t.id = ?4 AND t.status = 'SEARCHING' AND t.search_expires_ms > ?2
      AND d.approved = 1 AND d.available = 1 AND d.last_seen_ms BETWEEN ?2 - ?6 AND ?2
      AND NOT EXISTS (SELECT 1 FROM lab_trips active WHERE active.driver_id = d.id
        AND active.status IN ('DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'PASSENGER_CONFIRMED_BOARDING', 'IN_PROGRESS'))
    ON CONFLICT DO NOTHING
    RETURNING id, trip_id, driver_id, expires_ms
  `).bind(crypto.randomUUID(), now, timeoutMs, tripId, driverId, staleMs).first();
}

export async function expireOffers(db, now, limit = 40) {
  const { meta } = await db.prepare(`
    UPDATE lab_dispatch_offers SET status = 'expired' WHERE id IN (
      SELECT id FROM lab_dispatch_offers WHERE status = 'pending' AND expires_ms <= ?
      ORDER BY expires_ms, id LIMIT ?
    )
  `).bind(now, limit).run();
  return meta.changes;
}

export async function acceptOffer(db, { offerId, driverId, now, staleMs = 75_000 }) {
  // D1 executes the batch atomically. The assignment trigger writes the outbox
  // event in the same transaction, and the next statement marks only its offer.
  const [trip] = await db.batch([
    db.prepare(`
      UPDATE lab_trips AS t
      SET status = 'DRIVER_ASSIGNED', driver_id = ?2, assigned_ms = ?3, version = version + 1
      WHERE t.status = 'SEARCHING' AND t.search_expires_ms > ?3
        AND EXISTS (SELECT 1 FROM lab_dispatch_offers o JOIN lab_drivers d ON d.id = o.driver_id
          WHERE o.id = ?1 AND o.trip_id = t.id AND o.driver_id = ?2 AND o.status = 'pending'
            AND o.expires_ms > ?3 AND d.approved = 1 AND d.available = 1
            AND d.ride_class = t.ride_class AND d.last_seen_ms BETWEEN ?3 - ?4 AND ?3)
        AND NOT EXISTS (SELECT 1 FROM lab_trips active WHERE active.driver_id = ?2
          AND active.status IN ('DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'PASSENGER_CONFIRMED_BOARDING', 'IN_PROGRESS'))
      RETURNING id, driver_id, status, version
    `).bind(offerId, driverId, now, staleMs),
    db.prepare(`
      UPDATE lab_dispatch_offers SET status = 'accepted'
      WHERE id = ? AND driver_id = ? AND status = 'pending' AND changes() = 1
    `).bind(offerId, driverId),
  ]);
  return trip.results[0] ?? null;
}

export async function claimEvent(db, { now, leaseMs = 30_000 }) {
  return db.prepare(`
    UPDATE lab_outbox SET lease_token = ?1, lease_expires_ms = ?2 + ?3, attempts = attempts + 1
    WHERE event_id = (
      SELECT event_id FROM lab_outbox WHERE completed_ms IS NULL AND available_ms <= ?2
        AND (lease_expires_ms IS NULL OR lease_expires_ms <= ?2)
      ORDER BY available_ms, event_id LIMIT 1
    ) RETURNING event_id, type, resource_id, lease_token, attempts
  `).bind(crypto.randomUUID(), now, leaseMs).first();
}

export async function completeEvent(db, { eventId, leaseToken, now }) {
  const { meta } = await db.prepare(`
    UPDATE lab_outbox SET completed_ms = ?1, lease_token = NULL, lease_expires_ms = NULL
    WHERE event_id = ?2 AND lease_token = ?3 AND completed_ms IS NULL AND lease_expires_ms > ?1
  `).bind(now, eventId, leaseToken).run();
  return meta.changes === 1;
}
