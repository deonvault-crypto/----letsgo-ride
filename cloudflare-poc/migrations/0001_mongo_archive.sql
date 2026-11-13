-- A lossless-in-principle staging archive for Mongo Extended JSON, NOT an app schema.
-- Original MongoDB _id JSON and each entire document are retained verbatim.
-- A SHA-256 key avoids silently conflating string / ObjectId / numeric identifiers.
-- This table must not be used to serve production ride, wallet or auth requests.
CREATE TABLE IF NOT EXISTS mongo_archive (
  source_collection TEXT NOT NULL,
  id_sha256 TEXT NOT NULL CHECK(length(id_sha256) = 64),
  id_ejson TEXT NOT NULL,
  document_ejson TEXT NOT NULL,
  document_sha256 TEXT NOT NULL CHECK(length(document_sha256) = 64),
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(source_collection, id_sha256),
  CHECK(length(source_collection) BETWEEN 1 AND 120),
  CHECK(json_valid(id_ejson)),
  CHECK(json_valid(document_ejson))
);
CREATE INDEX IF NOT EXISTS ix_mongo_archive_source ON mongo_archive (source_collection);
