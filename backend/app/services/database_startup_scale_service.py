from __future__ import annotations

import hashlib
from types import MethodType
from typing import Any

from app.database import database


async def _prepare_unique_user_email_index_scale_safe(self: Any) -> None:
    """Run email migration work only when the unique index is actually missing.

    The legacy startup path loaded every user into Python and rewrote every normalized
    email on every process restart. Once MongoDB already owns the unique index there
    is no migration work to repeat. If the index is absent, duplicate detection and
    normalization run inside MongoDB before the unique index is created.
    """
    if self.db is None:
        return
    users = self.db["users"]
    index_info = await users.index_information()
    existing = index_info.get("unique_normalized_user_email") or {}
    if existing.get("unique"):
        return

    duplicate_pipeline = [
        {"$match": {"email": {"$type": "string"}}},
        {
            "$project": {
                "id": 1,
                "normalized": {"$toLower": {"$trim": {"input": "$email"}}},
            }
        },
        {"$match": {"normalized": {"$ne": ""}}},
        {
            "$group": {
                "_id": "$normalized",
                "ids": {"$push": "$id"},
                "count": {"$sum": 1},
            }
        },
        {"$match": {"count": {"$gt": 1}}},
        {"$limit": 20},
    ]
    duplicates = [item async for item in users.aggregate(duplicate_pipeline)]
    if duplicates:
        fingerprints = [
            hashlib.sha256(str(item.get("_id") or "").encode()).hexdigest()[:12]
            for item in duplicates
        ]
        raise RuntimeError(
            f"Duplicate normalized user emails must be resolved before startup: {fingerprints}"
        )

    await users.update_many(
        {"email": {"$type": "string"}},
        [
            {
                "$set": {
                    "normalized_email": {"$toLower": {"$trim": {"input": "$email"}}}
                }
            }
        ],
    )
    await users.create_index(
        [("normalized_email", 1)],
        name="unique_normalized_user_email",
        unique=True,
        partialFilterExpression={"normalized_email": {"$type": "string"}},
    )


def install_database_startup_scale_guard() -> None:
    """Install the scale-safe migration implementation before Database.connect()."""
    database._prepare_unique_user_email_index = MethodType(  # type: ignore[attr-defined]
        _prepare_unique_user_email_index_scale_safe,
        database,
    )
