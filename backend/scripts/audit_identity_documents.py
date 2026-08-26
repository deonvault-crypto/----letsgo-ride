"""Dry-run inventory for legacy identity documents.

This script never changes Cloudinary or MongoDB. Run it against staging before the
separate, explicitly approved migration that converts every legacy asset to
authenticated delivery. It prints counts only and never prints URLs or public IDs.
"""

import asyncio
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import database


async def main() -> None:
    await database.connect(ensure_indexes=False)
    counts: Counter[str] = Counter()
    try:
        for collection in ("drivers", "worker_applications"):
            for owner in await database.find_many(collection):
                for document in owner.get("documents", []):
                    counts[f"{collection}.total"] += 1
                    delivery = str(document.get("delivery_type") or "legacy_public")
                    counts[f"{collection}.{delivery}"] += 1
                    if document.get("file_url"):
                        counts[f"{collection}.stored_url"] += 1
        for key in sorted(counts):
            print(f"{key}={counts[key]}")
    finally:
        await database.close()


if __name__ == "__main__":
    asyncio.run(main())
