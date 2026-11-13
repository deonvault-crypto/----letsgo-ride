-- Synthetic Ride Now storage used by the local Worker test harness.
CREATE TABLE lab_drivers (
  id TEXT PRIMARY KEY,
  approved INTEGER NOT NULL CHECK (approved IN (0, 1)),
  available INTEGER NOT NULL CHECK (available IN (0, 1)),
  ride_class TEXT NOT NULL,
  latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  last_seen_ms INTEGER NOT NULL
) STRICT;

CREATE INDEX lab_drivers_dispatch ON lab_drivers (ride_class, latitude, longitude, last_seen_ms)
  WHERE approved = 1 AND available = 1;

CREATE TABLE lab_trips (
  id TEXT PRIMARY KEY,
  passenger_user_id TEXT NOT NULL,
  client_request_id TEXT NOT NULL,
  driver_id TEXT REFERENCES lab_drivers (id),
  ride_class TEXT NOT NULL,
  pickup_latitude REAL NOT NULL CHECK (pickup_latitude BETWEEN -90 AND 90),
  pickup_longitude REAL NOT NULL CHECK (pickup_longitude BETWEEN -180 AND 180),
  status TEXT NOT NULL CHECK (status IN (
    'SEARCHING', 'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED',
    'PASSENGER_CONFIRMED_BOARDING', 'IN_PROGRESS', 'COMPLETED', 'NO_DRIVER_FOUND',
    'CANCELLED_BY_PASSENGER', 'CANCELLED_BY_DRIVER', 'CANCELLED_BY_ADMIN'
  )),
  search_expires_ms INTEGER NOT NULL,
  assigned_ms INTEGER,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (passenger_user_id, client_request_id)
) STRICT;

CREATE UNIQUE INDEX lab_one_active_trip_per_passenger ON lab_trips (passenger_user_id)
  WHERE status IN ('SEARCHING', 'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'PASSENGER_CONFIRMED_BOARDING', 'IN_PROGRESS');

CREATE UNIQUE INDEX lab_one_active_trip_per_driver ON lab_trips (driver_id)
  WHERE status IN ('DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'PASSENGER_CONFIRMED_BOARDING', 'IN_PROGRESS');

CREATE TABLE lab_dispatch_offers (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES lab_trips (id),
  driver_id TEXT NOT NULL REFERENCES lab_drivers (id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled', 'declined')),
  expires_ms INTEGER NOT NULL,
  UNIQUE (trip_id, driver_id)
) STRICT;

CREATE UNIQUE INDEX lab_one_pending_offer_per_driver ON lab_dispatch_offers (driver_id) WHERE status = 'pending';
CREATE UNIQUE INDEX lab_one_pending_offer_per_trip ON lab_dispatch_offers (trip_id) WHERE status = 'pending';
CREATE INDEX lab_due_pending_offers ON lab_dispatch_offers (expires_ms) WHERE status = 'pending';

CREATE TABLE lab_outbox (
  event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  available_ms INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_token TEXT UNIQUE,
  lease_expires_ms INTEGER,
  completed_ms INTEGER,
  CHECK ((lease_token IS NULL) = (lease_expires_ms IS NULL))
) STRICT;

CREATE INDEX lab_outbox_due ON lab_outbox (available_ms, event_id) WHERE completed_ms IS NULL;

-- The assignment and its notification intent commit together. A unique event ID
-- makes downstream delivery retries distinguishable from new assignments.
CREATE TRIGGER lab_publish_driver_assignment AFTER UPDATE OF status ON lab_trips
WHEN OLD.status = 'SEARCHING' AND NEW.status = 'DRIVER_ASSIGNED'
BEGIN
  INSERT INTO lab_outbox (event_id, type, resource_id, available_ms)
  VALUES (NEW.id || ':assigned:' || NEW.version, 'hailing.trip.driver_assigned', NEW.id, NEW.assigned_ms);
END;
