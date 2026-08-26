"""Safely migrate identity documents to canonical authenticated storage.

Dry-run is the default. Apply mode requires an explicit environment/database,
approved inventory count, backup reference, and confirmation phrase. Output is
aggregate-only and never contains provider IDs, filenames, paths, or URLs.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import cloudinary.uploader

from app.database import database
from scripts.audit_identity_documents import validate_runtime
from scripts.identity_document_inventory import (
    DocumentPlan,
    aggregate_counts,
    configure_cloudinary,
    inspect_identity_documents,
    safe_count_lines,
)


APPLY_CONFIRMATION = "APPLY_IDENTITY_DOCUMENT_MIGRATION"
BLOCKING_ACTIONS = {
    "missing_provider_asset",
    "requires_reupload",
    "ownership_error",
    "malformed",
    "unsafe_path",
    "provider_lookup_error",
}


def validate_apply_authorization(
    *,
    apply: bool,
    confirmation: str | None,
    backup_reference: str | None,
) -> None:
    if not apply:
        return
    if confirmation != APPLY_CONFIRMATION:
        raise RuntimeError("Apply mode requires the exact migration confirmation phrase.")
    if not backup_reference or len(backup_reference.strip()) < 8:
        raise RuntimeError("Apply mode requires an approved backup reference.")


def _canonical_document(document: dict[str, Any]) -> dict[str, Any]:
    canonical = dict(document)
    canonical["delivery_type"] = "authenticated"
    canonical.pop("file_url", None)
    canonical.pop("url", None)
    canonical.pop("secure_url", None)
    canonical.pop("storage_path", None)
    canonical.pop("legacy_local_document", None)
    return canonical


async def _apply_plan(plans: list[DocumentPlan]) -> int:
    plans_by_owner: dict[tuple[str, str], list[DocumentPlan]] = defaultdict(list)
    for plan in plans:
        if plan.action in {"cleanup_only", "authenticated_migration"}:
            plans_by_owner[(plan.collection, plan.owner_id)].append(plan)

    updated_documents = 0
    for (collection, owner_id), owner_plans in plans_by_owner.items():
        owner = await database.find_one(collection, {"id": owner_id})
        if not owner or not isinstance(owner.get("documents"), list):
            raise RuntimeError("Identity-document owner changed after preflight.")
        documents = [dict(item) for item in owner["documents"]]
        for plan in owner_plans:
            if plan.document_index < 0 or plan.document_index >= len(documents):
                raise RuntimeError("Identity-document inventory changed after preflight.")
            document = documents[plan.document_index]
            if plan.action == "authenticated_migration":
                await asyncio.to_thread(
                    cloudinary.uploader.rename,
                    str(document["cloudinary_public_id"]),
                    str(document["cloudinary_public_id"]),
                    type="upload",
                    to_type="authenticated",
                    resource_type=str(document.get("resource_type") or "image"),
                    overwrite=True,
                    invalidate=True,
                )
            documents[plan.document_index] = _canonical_document(document)
            updated_documents += 1
        updated = await database.update_one(collection, owner_id, {"documents": documents})
        if not updated:
            raise RuntimeError("Identity-document metadata update failed after provider migration.")
    return updated_documents


async def main(
    *,
    environment: str,
    database_name: str,
    expected_count: int,
    apply: bool,
    confirmation: str | None,
    backup_reference: str | None,
) -> None:
    validate_runtime(environment, database_name)
    validate_apply_authorization(
        apply=apply,
        confirmation=confirmation,
        backup_reference=backup_reference,
    )
    configure_cloudinary()
    await database.connect(ensure_indexes=False)
    try:
        plans, counts = await inspect_identity_documents()
        if counts["scanned"] != expected_count:
            raise RuntimeError("Identity-document count differs from the approved inventory.")
        if any(counts[action] for action in BLOCKING_ACTIONS):
            for line in safe_count_lines(counts, mode="blocked-preflight"):
                print(line)
            raise RuntimeError("Identity-document migration is blocked by the aggregate preflight.")

        if apply:
            updated = await _apply_plan(plans)
            if updated != counts["eligible"]:
                raise RuntimeError("Applied identity-document count differs from the approved plan.")
            mode = "apply"
        else:
            mode = "dry-run"
        for line in safe_count_lines(aggregate_counts(plans), mode=mode):
            print(line)
    finally:
        await database.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--environment", choices=("staging", "production"), required=True)
    parser.add_argument("--database-name", required=True)
    parser.add_argument("--expected-count", type=int, required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--confirmation")
    parser.add_argument("--backup-reference")
    args = parser.parse_args()
    asyncio.run(
        main(
            environment=args.environment,
            database_name=args.database_name,
            expected_count=args.expected_count,
            apply=args.apply,
            confirmation=args.confirmation,
            backup_reference=args.backup_reference,
        )
    )
