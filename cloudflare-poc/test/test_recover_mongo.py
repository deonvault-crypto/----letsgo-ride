from contextlib import closing
from pathlib import Path
import sqlite3
import subprocess
import sys

from bson import BSON, Decimal128, Int64, ObjectId, json_util


ROOT = Path(__file__).resolve().parents[1]


def recover(*arguments):
    return subprocess.run([sys.executable, str(ROOT / "scripts/recover_mongo.py"), *map(str, arguments)],
                          capture_output=True, text=True, check=False)


def write_collection(dump, name, records, metadata=b'{"options":{},"indexes":[{"key":{"_id":1},"name":"_id_"}]}'):
    (dump / f"{name}.metadata.json").write_bytes(metadata)
    bson = b"".join(BSON.encode(record) for record in records)
    (dump / f"{name}.bson").write_bytes(bson)
    return bson


def test_recovers_bson_ids_relationships_payment_audit_and_index_metadata(tmp_path):
    dump = tmp_path / "letsgoride"
    dump.mkdir()
    archive = tmp_path / "recovery.sqlite3"
    user_id = ObjectId("100000000000000000000000")
    trip_id = ObjectId("200000000000000000000000")
    payment_id = ObjectId("300000000000000000000000")
    source = {
        "users": [{"_id": user_id, "id": "synthetic-user", "password_hash": "synthetic-only"}],
        "hailing_trips": [{"_id": trip_id, "passenger_user_id": "synthetic-user", "owner_ref": user_id}],
        "driver_settlement_payments": [{"_id": payment_id, "trip": trip_id, "amount": Decimal128("13.20"),
                                        "reference": Int64(9_007_199_254_740_993)}],
        "audit_logs": [{"_id": {"category": "synthetic", "sequence": 1}, "payment": payment_id,
                         "payload": "x" * 120_000}],
        "empty_records": [],
    }
    for collection, documents in source.items():
        write_collection(dump, collection, documents)
    (dump / "user_view.metadata.json").write_text('{"options":{"viewOn":"users","pipeline":[]}}')
    prelude = b'{"ServerVersion":"7.0.29","ToolVersion":"100.20.1"}'
    (dump / "prelude.json").write_bytes(prelude)

    staged = recover("stage", dump, archive)
    assert staged.returncode == 0, staged.stderr
    assert archive.stat().st_mode & 0o777 == 0o600
    verified = recover("verify", dump, archive)
    assert verified.returncode == 0, verified.stderr
    assert json_util.loads(verified.stdout) == {"collections": {
        "users": 1, "hailing_trips": 1, "driver_settlement_payments": 1,
        "audit_logs": 1, "empty_records": 0, "user_view": 0,
    }, "documents": 4}
    with closing(sqlite3.connect(archive)) as db:
        for name, documents in source.items():
            rows = db.execute("SELECT bson_id, bson_document FROM source_documents WHERE collection=?", (name,))
            assert rows.fetchall() == [(BSON.encode({"_id": doc["_id"]}), BSON.encode(doc)) for doc in documents]
        row = db.execute("SELECT metadata FROM source_collections WHERE name='users'").fetchone()
        assert row == ((dump / "users.metadata.json").read_bytes(),)
        assert db.execute("SELECT content FROM dump_metadata WHERE filename='prelude.json'").fetchone() == (prelude,)

    output = tmp_path / "payments.ndjson"
    exported = recover("export-ejson", archive, "driver_settlement_payments", output)
    assert exported.returncode == 0, exported.stderr
    assert json_util.loads(output.read_text()) == source["driver_settlement_payments"][0]
    assert '"$numberLong": "9007199254740993"' in output.read_text()
    assert recover("export-ejson", archive, "driver_settlement_payments", output).returncode == 1
    assert recover("stage", dump, archive).returncode == 1


def test_corrupt_duplicate_and_empty_snapshots_fail_without_a_published_archive(tmp_path):
    dump = tmp_path / "letsgoride"
    dump.mkdir()
    archive = tmp_path / "archive.sqlite3"
    write_collection(dump, "users", [])
    assert recover("stage", dump, archive).returncode == 1
    write_collection(dump, "users", [{"_id": "duplicated"}, {"_id": "duplicated"}])
    assert recover("stage", dump, archive).returncode == 1
    original = write_collection(dump, "users", [{"_id": "synthetic"}])
    (dump / "users.bson").write_bytes(original[:-1])
    assert recover("stage", dump, archive).returncode == 1
    assert not archive.exists()


def test_verifier_rejects_altered_metadata_and_document_bytes(tmp_path):
    dump = tmp_path / "letsgoride"
    dump.mkdir()
    archive = tmp_path / "archive.sqlite3"
    write_collection(dump, "users", [{"_id": "synthetic"}])
    assert recover("stage", dump, archive).returncode == 0
    (dump / "users.metadata.json").write_text('{"options":{},"indexes":[]}')
    assert recover("verify", dump, archive).returncode == 1
    write_collection(dump, "users", [{"_id": "synthetic"}])
    with closing(sqlite3.connect(archive)) as db, db:
        db.execute("UPDATE source_documents SET bson_document=?", (BSON.encode({"_id": "changed"}),))
    assert recover("verify", dump, archive).returncode == 1
    assert recover("export-ejson", archive, "users", tmp_path / "users.ndjson").returncode == 1
    assert not (tmp_path / "users.ndjson").exists()
