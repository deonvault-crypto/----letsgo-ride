"""Read-only duplicate normalized-email preflight; prints hashes, never addresses."""

import asyncio
import hashlib
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import database


async def main() -> None:
    await database.connect(ensure_indexes=False)
    groups: dict[str, list[str]] = defaultdict(list)
    try:
        for user in await database.find_many("users"):
            email = str(user.get("email") or "").strip().lower()
            if email:
                groups[email].append(str(user.get("id") or ""))
        duplicates = {email: ids for email, ids in groups.items() if len(ids) > 1}
        print(f"normalized_email_groups={len(groups)}")
        print(f"duplicate_groups={len(duplicates)}")
        for email, ids in duplicates.items():
            print(f"duplicate_hash={hashlib.sha256(email.encode()).hexdigest()[:12]} count={len(ids)}")
    finally:
        await database.close()


if __name__ == "__main__":
    asyncio.run(main())
