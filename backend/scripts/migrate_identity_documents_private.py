"""Convert legacy staging identity assets to authenticated Cloudinary delivery.

Dry-run is the default. Mutation requires both ``--apply`` and ``APP_ENV=staging``.
Run the audit first and take a staging backup before applying.
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import cloudinary
import cloudinary.uploader

from app.config import get_settings
from app.database import database


async def main(apply: bool) -> None:
    settings = get_settings()
    if apply and settings.app_env != "staging":
        raise RuntimeError("Identity-document migration is permitted only with APP_ENV=staging.")
    cloudinary.config(cloud_name=settings.cloudinary_cloud_name, api_key=settings.cloudinary_api_key, api_secret=settings.cloudinary_api_secret, secure=True)
    await database.connect(ensure_indexes=False)
    total = converted = skipped = 0
    try:
        for collection in ("drivers", "worker_applications"):
            for owner in await database.find_many(collection):
                documents = list(owner.get("documents", []))
                changed = False
                for index, original in enumerate(documents):
                    total += 1
                    document = dict(original)
                    public_id = document.get("cloudinary_public_id")
                    if not public_id or document.get("delivery_type") == "authenticated":
                        skipped += 1
                        continue
                    if apply:
                        resource_type = document.get("resource_type") or "image"
                        await asyncio.to_thread(
                            cloudinary.uploader.rename,
                            public_id,
                            public_id,
                            type="upload",
                            to_type="authenticated",
                            resource_type=resource_type,
                            overwrite=True,
                            invalidate=True,
                        )
                        document["delivery_type"] = "authenticated"
                        document.pop("file_url", None)
                        documents[index] = document
                        changed = True
                    converted += 1
                if changed:
                    await database.update_one(collection, owner["id"], {"documents": documents})
        print(f"mode={'apply' if apply else 'dry-run'} total={total} candidates={converted} skipped={skipped}")
    finally:
        await database.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    asyncio.run(main(parser.parse_args().apply))
