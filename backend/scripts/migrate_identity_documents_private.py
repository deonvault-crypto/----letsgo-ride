"""Safely migrate identity documents to canonical authenticated storage.

Dry-run is the default. Apply mode requires an explicit environment/database,
approved inventory count, backup reference, and confirmation phrase. Output is
aggregate-only and never contains provider IDs, filenames, paths, URLs, or
account identifiers.

A deliberately explicit partial mode may defer only historical local-path
records that require re-upload while still migrating provider-backed assets.
All integrity/provider failures continue to fail closed.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Mapping

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
PARTIAL_APPLY_CONFIRMATION = "APPLY_ELIGIBLE_IDENTITY_DOCUMENT_MIGRATION"

# These conditions can never be bypassed by partial mode. They indicate that
# ownership/integrity or trusted-provider state is not safe enough for writes.
HARD_BLOCKING_ACTIONS = {
    "missing_provider_asset",
    "ownership_error",
    "malformed",
    "provider_lookup_error",
}

# These conditions represent historical local-only records. Partial mode may
# leave those exact records untouched for a later re-upload workflow.
REUPLOAD_BLOCKING_ACTIONS = {
    "requires_reupload",
    "unsafe_path",
}

BLOCKING_ACTIONS = HARD_BLOCKING_ACTIONS | REUPLOAD_BLOCKING_ACTIONS


def validate_apply_authorization(
    *,
    apply: bool,
    confirmation: str | None,
    backup_reference: str | None,
    allow_reupload_blockers: bool = False,
) -> None:
    if not apply:
        return
    expected_confirmation = (
        PARTIAL_APPLY_CONFIRMATION if allow_reupload_blockers else APPLY_CONFIRMATION
    )
    if confirmation != expected_confirmation:
        raise RuntimeError("Apply mode requires the exact migration confirmation phrase.")
    if not backup_reference or len(backup_reference.strip()) < 8:
        raise RuntimeError("Apply mode requires an approved backup reference.")


def active_blocking_actions(
    counts: Mapping[str, int],
    *,
    allow_reupload_blockers: bool,
) -> tuple[str, ...]:
    """Return aggregate blocker categories that must stop this migration run."""
    actions = HARD_BLOCKING_ACTIONS if allow_reupload_blockers else BLOCKING_ACTIONS
    return tuple(sorted(action for action in actions if int(counts.get(action, 0)) > 0))


def _canonical_document(document: dict[str, Any]) -> dict[str, Any]:
    canonical = dict(document)
    canonical["delivery_type"] = "authenticated"
    canonical.pop("file_url", None)
    canonical.pop("url", None)
    canonical.pop("secure_url", None)
    canonical.pop("storage_path", None)
    canonical.pop("legacy_local_document", None)
    return canonical


async def _rename_provider_document(
    document: Mapping[str, Any],
    *,
    source_type: str,
    target_type: str,
) -> None:
    public_id = str(document.get("cloudinary_public_id") or "").strip()
    if not public_id:
        raise RuntimeError("Provider-backed identity document changed after preflight.")
    await asyncio.to_thread(
        cloudinary.uploader.rename,
        public_id,
        public_id,
        type=source_type,
        to_type=target_type,
        resource_type=str(document.get("resource_type") or "image"),
        overwrite=True,
        invalidate=True,
    )


async def _rollback_provider_document(document: Mapping[str, Any]) -> None:
    try:
        await _rename_provider_document(
            document,
            source_type="authenticated",
            target_type="upload",
        )
    except Exception as exc:
        raise RuntimeError(
            "Identity-document metadata update failed and provider rollback also failed. "
            "Stop migration and reconcile the provider asset before retrying."
        ) from exc


async def _apply_plan(plans: list[DocumentPlan]) -> int:
    plans_by_owner: dict[tuple[str, str], list[DocumentPlan]] = defaultdict(list)
    for plan in plans:
        # Re-upload/local-path and all other blocked plans are intentionally not
        # included here. Partial mode therefore cannot mutate those records.
        if plan.action in {"cleanup_only", "authenticated_migration"}:
            plans_by_owner[(plan.collection, plan.owner_id)].append(plan)

    updated_documents = 0
    for (collection, owner_id), owner_plans in plans_by_owner.items():
        owner = await database.find_one(collection, {"id": owner_id})
        if not owner or not isinstance(owner.get("documents"), list):
            raise RuntimeError("Identity-document owner changed after preflight.")
        documents = [dict(item) for item in owner["documents"]]

        # Commit one document at a time. A later provider failure therefore does
        # not invalidate earlier documents that were already safely canonicalized.
        for plan in sorted(owner_plans, key=lambda item: item.document_index):
            if plan.document_index < 0 or plan.document_index >= len(documents):
                raise RuntimeError("Identity-document inventory changed after preflight.")
            document = dict(documents[plan.document_index])
            provider_moved = False
            if plan.action == "authenticated_migration":
                if document.get("storage_path"):
                    raise RuntimeError("Local-path identity document changed after preflight.")
                await _rename_provider_document(
                    document,
                    source_type="upload",
                    target_type="authenticated",
                )
                provider_moved = True

            documents[plan.document_index] = _canonical_document(document)
            try:
                updated = await database.update_one(
                    collection,
                    owner_id,
                    {"documents": documents},
                )
            except Exception:
                if provider_moved:
                    await _rollback_provider_document(document)
                raise
            if not updated:
                if provider_moved:
                    await _rollback_provider_document(document)
                raise RuntimeError("Identity-document metadata update failed after provider migration.")
            updated_documents += 1

    return updated_documents


async def main(
    *,
    environment: str,
    database_name: str,
    expected_count: int,
    apply: bool,
    confirmation: str | None,
    backup_reference: str | None,
    allow_reupload_blockers: bool = False,
) -> None:
    validate_runtime(environment, database_name)
    validate_apply_authorization(
        apply=apply,
        confirmation=confirmation,
        backup_reference=backup_reference,
        allow_reupload_blockers=allow_reupload_blockers,
    )
    configure_cloudinary()
    await database.connect(ensure_indexes=False)
    try:
        plans, counts = await inspect_identity_documents()
        if counts["scanned"] != expected_count:
            raise RuntimeError("Identity-document count differs from the approved inventory.")

        blockers = active_blocking_actions(
            counts,
            allow_reupload_blockers=allow_reupload_blockers,
        )
        if blockers:
            for line in safe_count_lines(counts, mode="blocked-preflight"):
                print(line)
            raise RuntimeError(
                "Identity-document migration is blocked by the aggregate preflight."
            )

        if apply:
            updated = await _apply_plan(plans)
            if updated != counts["eligible"]:
                raise RuntimeError("Applied identity-document count differs from the approved plan.")
            mode = "apply-partial" if allow_reupload_blockers else "apply"
        else:
            mode = "dry-run-partial" if allow_reupload_blockers else "dry-run"
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
    parser.add_argument(
        "--allow-reupload-blockers",
        action="store_true",
        help=(
            "Defer only local-path/re-upload-required records while migrating eligible "
            "provider-backed documents. Hard integrity/provider blockers still fail closed."
        ),
    )
    args = parser.parse_args()
    asyncio.run(
        main(
            environment=args.environment,
            database_name=args.database_name,
            expected_count=args.expected_count,
            apply=args.apply,
            confirmation=args.confirmation,
            backup_reference=args.backup_reference,
            allow_reupload_blockers=args.allow_reupload_blockers,
        )
    )
