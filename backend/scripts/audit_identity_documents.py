"""Read-only, aggregate-only audit of stored identity documents."""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings
from app.database import database
from scripts.identity_document_inventory import (
    configure_cloudinary,
    inspect_identity_documents,
    safe_count_lines,
)


def validate_runtime(environment: str, database_name: str) -> None:
    settings = get_settings()
    configured_environment = settings.app_env.strip().lower()
    if configured_environment != environment:
        raise RuntimeError("Runtime environment does not match the explicit audit target.")
    if settings.mongodb_db_name.strip() != database_name:
        raise RuntimeError("Runtime database does not match the explicit audit target.")
    if environment == "staging" and database_name != "letsgoride_staging":
        raise RuntimeError("Staging identity-document audit requires letsgoride_staging.")
    if environment == "production" and database_name == "letsgoride_staging":
        raise RuntimeError("Production identity-document audit cannot target staging.")


async def main(environment: str, database_name: str, expected_count: int | None) -> None:
    validate_runtime(environment, database_name)
    configure_cloudinary()
    await database.connect(ensure_indexes=False)
    try:
        _, counts = await inspect_identity_documents()
        if expected_count is not None and counts["scanned"] != expected_count:
            raise RuntimeError("Identity-document count differs from the approved inventory.")
        for line in safe_count_lines(counts, mode="audit-dry-run"):
            print(line)
    finally:
        await database.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--environment", choices=("staging", "production"), required=True)
    parser.add_argument("--database-name", required=True)
    parser.add_argument("--expected-count", type=int)
    args = parser.parse_args()
    asyncio.run(main(args.environment, args.database_name, args.expected_count))
