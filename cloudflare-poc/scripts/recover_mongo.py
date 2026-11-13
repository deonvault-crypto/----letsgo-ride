#!/usr/bin/env python3
"""Stage and verify an existing mongodump directory without a database connection."""

import argparse
import hashlib
import json
import os
import re
import sqlite3
import struct
import sys
import tempfile
from contextlib import closing
from pathlib import Path

from bson import decode, encode, json_util
from bson.codec_options import CodecOptions, DatetimeConversion
from bson.errors import BSONError


CODEC = CodecOptions(datetime_conversion=DatetimeConversion.DATETIME_AUTO)
COLLECTION_NAME = re.compile(r"[A-Za-z_][A-Za-z0-9_.-]{0,119}\Z")
MAX_BSON_SIZE = 16 * 1024 * 1024
SCHEMA = """
CREATE TABLE dump_metadata (
    filename TEXT PRIMARY KEY,
    content BLOB NOT NULL,
    sha256 TEXT NOT NULL
) STRICT;
CREATE TABLE source_collections (
    name TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK(kind IN ('collection', 'view')),
    metadata BLOB NOT NULL,
    metadata_sha256 TEXT NOT NULL,
    bson_sha256 TEXT NOT NULL,
    bson_bytes INTEGER NOT NULL,
    document_count INTEGER NOT NULL
) STRICT;
CREATE TABLE source_documents (
    collection TEXT NOT NULL REFERENCES source_collections(name),
    ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
    bson_id BLOB NOT NULL,
    bson_document BLOB NOT NULL,
    document_sha256 TEXT NOT NULL,
    PRIMARY KEY(collection, ordinal),
    UNIQUE(collection, bson_id)
) STRICT;
"""


class RecoveryError(Exception):
    pass


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def dump_files(source):
    if source.name != "letsgoride" or not source.is_dir():
        raise RecoveryError("Expected an uncompressed dump database directory named letsgoride")
    files = list(source.iterdir())
    if not files or any(
        not path.is_file() or path.is_symlink() or (
            path.name != "prelude.json" and not path.name.endswith((".bson", ".metadata.json"))
        )
        for path in files
    ):
        raise RecoveryError("Dump contains missing, unsupported, or linked files")
    return files


def dump_metadata(files):
    for path in files:
        if path.name == "prelude.json":
            raw = path.read_bytes()
            if not isinstance(json.loads(raw), dict):
                raise RecoveryError("Invalid mongodump prelude")
            yield path.name, raw, sha256(raw)


def inventory(files):
    """Require an uncompressed database directory from a consistent snapshot."""
    dumps = {path.name.removesuffix(".bson"): path for path in files if path.name.endswith(".bson")}
    metadata = {
        path.name.removesuffix(".metadata.json"): path
        for path in files if path.name.endswith(".metadata.json")
    }
    if not metadata or dumps.keys() - metadata.keys():
        raise RecoveryError("Each collection requires its original mongodump metadata")
    for name, path in sorted(metadata.items()):
        if not COLLECTION_NAME.fullmatch(name):
            raise RecoveryError("Unsupported collection filename. Preserve the original dump for review")
        raw = path.read_bytes()
        try:
            content = json.loads(raw)
            is_view = isinstance(content.get("options", {}).get("viewOn"), str)
        except (ValueError, AttributeError, UnicodeError) as exc:
            raise RecoveryError(f"Invalid metadata for {name}") from exc
        if is_view == (name in dumps):
            raise RecoveryError(f"Unexpected BSON file presence for {name}")
        yield name, "view" if is_view else "collection", raw, dumps.get(name)


def documents(path, name):
    if path is None:
        return
    with path.open("rb") as source:
        ordinal = 0
        while length := source.read(4):
            try:
                size, = struct.unpack("<i", length)
                if not 5 <= size <= MAX_BSON_SIZE:
                    raise ValueError
                raw = length + source.read(size - 4)
                if len(raw) != size:
                    raise ValueError
                document = decode(raw, codec_options=CODEC)
                bson_id = encode({"_id": document["_id"]}, codec_options=CODEC)
            except (ValueError, KeyError, OverflowError, struct.error, BSONError) as exc:
                raise RecoveryError(f"Invalid BSON or _id in {name}, record {ordinal + 1}") from exc
            yield ordinal, bson_id, raw, sha256(raw)
            ordinal += 1


def stage(source, target):
    if target.is_relative_to(source) or target.exists():
        raise RecoveryError("Use a new archive path outside the original dump")
    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".lgr-recovery-", dir=target.parent) as temporary:
        archive = Path(temporary) / "archive.sqlite3"
        archive.touch(mode=0o600, exist_ok=False)
        with closing(sqlite3.connect(archive)) as db, db:
            db.execute("PRAGMA foreign_keys=ON")
            db.executescript(SCHEMA)
            files = dump_files(source)
            db.executemany("INSERT INTO dump_metadata VALUES (?, ?, ?)", dump_metadata(files))
            for name, kind, metadata, path in inventory(files):
                db.execute(
                    "INSERT INTO source_collections VALUES (?, ?, ?, ?, '', 0, 0)",
                    (name, kind, metadata, sha256(metadata)),
                )
                digest = hashlib.sha256()
                size = count = 0
                for ordinal, bson_id, raw, document_hash in documents(path, name):
                    db.execute("INSERT INTO source_documents VALUES (?, ?, ?, ?, ?)",
                               (name, ordinal, bson_id, raw, document_hash))
                    digest.update(raw)
                    size += len(raw)
                    count += 1
                db.execute(
                    "UPDATE source_collections SET bson_sha256=?, bson_bytes=?, document_count=? WHERE name=?",
                    (digest.hexdigest(), size, count, name),
                )
            if not db.execute("SELECT 1 FROM source_documents LIMIT 1").fetchone():
                raise RecoveryError("Snapshot contains no records")
        result = verify(source, archive)
        os.link(archive, target)
        return result


def verify(source, archive):
    with closing(sqlite3.connect(archive.as_uri() + "?mode=ro", uri=True)) as db:
        if db.execute("PRAGMA integrity_check").fetchone() != ("ok",) or db.execute(
            "PRAGMA foreign_key_check"
        ).fetchone():
            raise RecoveryError("Archive integrity or foreign key check failed")
        recorded = dict(db.execute("SELECT name, document_count FROM source_collections"))
        files = dump_files(source)
        if list(dump_metadata(files)) != db.execute("SELECT filename, content, sha256 FROM dump_metadata").fetchall():
            raise RecoveryError("Dump prelude or digest mismatch")
        verified = {}
        for name, kind, metadata, path in inventory(files):
            digest = hashlib.sha256()
            size = count = 0
            rows = db.execute(
                "SELECT ordinal, bson_id, bson_document, document_sha256 FROM source_documents "
                "WHERE collection=? ORDER BY ordinal", (name,),
            )
            for record in documents(path, name):
                if rows.fetchone() != record:
                    raise RecoveryError(f"Archive mismatch in {name}, record {record[0] + 1}")
                digest.update(record[2])
                size += len(record[2])
                count += 1
            expected = (kind, metadata, sha256(metadata), digest.hexdigest(), size, count)
            actual = db.execute(
                "SELECT kind, metadata, metadata_sha256, bson_sha256, bson_bytes, document_count "
                "FROM source_collections WHERE name=?", (name,),
            ).fetchone()
            if rows.fetchone() or actual != expected:
                raise RecoveryError(f"Archive metadata, digest or count mismatch in {name}")
            verified[name] = count
        if verified != recorded or not sum(verified.values()):
            raise RecoveryError("Collection inventory or total document count mismatch")
        return {"collections": verified, "documents": sum(verified.values())}


def export_ejson(archive, collection, output):
    """Export one collection for offline transformation in a protected workspace."""
    if not COLLECTION_NAME.fullmatch(collection):
        raise RecoveryError("Invalid collection name")
    output.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with closing(sqlite3.connect(archive.as_uri() + "?mode=ro", uri=True)) as db:
        expected = db.execute("SELECT document_count FROM source_collections WHERE name=?", (collection,)).fetchone()
        if expected is None:
            raise RecoveryError("Collection was not found in the verified snapshot")
        with tempfile.TemporaryDirectory(prefix=".lgr-ejson-", dir=output.parent) as temporary:
            staged = Path(temporary) / "collection.ndjson"
            staged.touch(mode=0o600, exist_ok=False)
            count = 0
            with staged.open("w", encoding="utf-8", newline="\n") as destination:
                rows = db.execute(
                    "SELECT bson_document, document_sha256 FROM source_documents WHERE collection=? ORDER BY ordinal",
                    (collection,),
                )
                for raw, digest in rows:
                    if sha256(raw) != digest:
                        raise RecoveryError(f"Archive mismatch in {collection}, record {count + 1}")
                    document = decode(raw, codec_options=CODEC)
                    line = json_util.dumps(document, json_options=json_util.CANONICAL_JSON_OPTIONS, ensure_ascii=False)
                    destination.write(line + "\n")
                    count += 1
            if count != expected[0]:
                raise RecoveryError("Export count does not match the archive")
            os.link(staged, output)
    return {"collection": collection, "documents": count}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for action in ("stage", "verify"):
        command = commands.add_parser(action)
        command.add_argument("dump", type=Path)
        command.add_argument("archive", type=Path)
    export = commands.add_parser("export-ejson")
    export.add_argument("archive", type=Path)
    export.add_argument("collection")
    export.add_argument("output", type=Path)
    args = parser.parse_args()
    try:
        if args.command == "stage":
            result = stage(args.dump.resolve(), args.archive.resolve())
        elif args.command == "verify":
            result = verify(args.dump.resolve(), args.archive.resolve())
        else:
            result = export_ejson(args.archive.resolve(), args.collection, args.output.resolve())
    except FileExistsError:
        print("Recovery failed: destination already exists.", file=sys.stderr)
        return 1
    except (OSError, sqlite3.Error, BSONError, ValueError) as exc:
        print(f"Recovery failed ({type(exc).__name__}). No archive or export was published.", file=sys.stderr)
        return 1
    except RecoveryError as exc:
        print(f"Recovery failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
