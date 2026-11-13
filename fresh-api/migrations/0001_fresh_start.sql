-- Fresh-start staging schema; do NOT apply over an existing production database.
-- No migration from or deletion of MongoDB data. Keep source backups separately.
PRAGMA foreign_keys = ON;
CREATE TABLE users (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_salt TEXT NOT NULL, password_hash TEXT NOT NULL,
 email_verified INTEGER NOT NULL DEFAULT 0 CHECK(email_verified IN (0,1)),
 role TEXT NOT NULL DEFAULT 'passenger' CHECK(role IN ('passenger','driver','admin')),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','deleted')),
 city TEXT, created_ms INTEGER NOT NULL, updated_ms INTEGER NOT NULL
) STRICT;
CREATE TABLE email_challenges (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 code_hash TEXT NOT NULL, expires_ms INTEGER NOT NULL,
 failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK(failed_attempts BETWEEN 0 AND 5),
 sent_ms INTEGER NOT NULL
) STRICT;
CREATE TABLE sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_ms INTEGER NOT NULL, expires_ms INTEGER NOT NULL,
 revoked_ms INTEGER
) STRICT;
CREATE INDEX sessions_user_expiry ON sessions(user_id,expires_ms);
CREATE TABLE auth_limits (
 key TEXT PRIMARY KEY, window_ms INTEGER NOT NULL, hits INTEGER NOT NULL
) STRICT;
CREATE TABLE driver_applications (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 status TEXT NOT NULL CHECK(status IN ('pending_documents','needs_review','approved','rejected')),
 vehicle_make TEXT, vehicle_model TEXT, plate_number TEXT,
 ride_class TEXT NOT NULL DEFAULT 'ECONOMY' CHECK(ride_class IN ('ECONOMY','COMFORT','XL')),
 city_id TEXT NOT NULL DEFAULT 'ZW-HRE',
 documents_verified INTEGER NOT NULL DEFAULT 0 CHECK(documents_verified IN (0,1)),
 review_notes TEXT, reviewed_by TEXT REFERENCES users(id),
 submitted_ms INTEGER NOT NULL, reviewed_ms INTEGER
) STRICT;
CREATE TABLE driver_presence (
 user_id TEXT PRIMARY KEY REFERENCES driver_applications(user_id) ON DELETE CASCADE,
 status TEXT NOT NULL CHECK(status IN ('offline','available','on_trip')),
 latitude REAL CHECK(latitude BETWEEN -90 AND 90), longitude REAL CHECK(longitude BETWEEN -180 AND 180),
 last_seen_ms INTEGER
) STRICT;
CREATE INDEX driver_presence_status ON driver_presence(status,last_seen_ms);
CREATE TABLE quotes (
 id TEXT PRIMARY KEY, passenger_id TEXT NOT NULL REFERENCES users(id),
 ride_class TEXT NOT NULL CHECK(ride_class IN ('ECONOMY','COMFORT','XL')),
 pickup_json TEXT NOT NULL, dropoff_json TEXT NOT NULL, route_json TEXT NOT NULL, fare_json TEXT NOT NULL,
 created_ms INTEGER NOT NULL, expires_ms INTEGER NOT NULL
) STRICT;
CREATE INDEX quotes_passenger_expiry ON quotes(passenger_id,expires_ms);
CREATE TABLE trips (
 id TEXT PRIMARY KEY, passenger_id TEXT NOT NULL REFERENCES users(id),
 driver_id TEXT REFERENCES users(id),
 quote_id TEXT NOT NULL REFERENCES quotes(id),
 client_request_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('SEARCHING','DRIVER_ASSIGNED','DRIVER_ARRIVED','IN_PROGRESS','COMPLETED','CANCELLED_BY_PASSENGER','CANCELLED_BY_DRIVER','CANCELLED_BY_ADMIN','NO_DRIVER_FOUND')),
 payment_method TEXT NOT NULL DEFAULT 'cash' CHECK(payment_method='cash'),
 payment_status TEXT NOT NULL DEFAULT 'cash_due' CHECK(payment_status IN ('cash_due','cash_collected','cancelled')),
 created_ms INTEGER NOT NULL, updated_ms INTEGER NOT NULL,
 assigned_ms INTEGER, completed_ms INTEGER, search_expires_ms INTEGER NOT NULL,
 UNIQUE(passenger_id,client_request_id)
) STRICT;
CREATE UNIQUE INDEX trips_one_active_passenger ON trips(passenger_id)
 WHERE status IN ('SEARCHING','DRIVER_ASSIGNED','DRIVER_ARRIVED','IN_PROGRESS');
CREATE UNIQUE INDEX trips_one_active_driver ON trips(driver_id)
 WHERE status IN ('DRIVER_ASSIGNED','DRIVER_ARRIVED','IN_PROGRESS');
CREATE TABLE dispatch_offers (
 id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id),
 driver_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL
 CHECK(status IN ('pending','accepted','declined','expired','cancelled')),
 expires_ms INTEGER NOT NULL, UNIQUE(trip_id,driver_id)
) STRICT;
CREATE UNIQUE INDEX dispatch_one_pending_driver ON dispatch_offers(driver_id) WHERE status='pending';
CREATE UNIQUE INDEX dispatch_one_pending_trip ON dispatch_offers(trip_id) WHERE status='pending';
CREATE TABLE admin_audit (
 id TEXT PRIMARY KEY, actor_user_id TEXT NOT NULL REFERENCES users(id),
 action TEXT NOT NULL, target_id TEXT NOT NULL, details_json TEXT NOT NULL,
 created_ms INTEGER NOT NULL
) STRICT;
CREATE INDEX admin_audit_recent ON admin_audit(created_ms DESC);
