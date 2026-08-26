"""Aggregate-only identity-document inventory shared by audit/migration tools.

The helpers in this module deliberately keep provider IDs, filenames, URLs,
paths, and account identifiers out of command output.  They are operational
tools, not public API code.
"""

from __future__ import annotations

import asyncio
from collections import Counter
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, Iterable

import cloudinary
import cloudinary.api

from app.config import get_settings
from app.database import database


DOCUMENT_COLLECTIONS = ("drivers", "worker_applications")
PROVIDER_AUTHENTICATED = "authenticated"
PROVIDER_UPLOAD = "upload"


class ProviderAssetMissing(Exception):
    """The trusted provider has no matching asset."""


class ProviderLookupUnavailable(Exception):
    """Provider inventory could not be completed safely."""


ProviderLookup = Callable[[str, str, str], Awaitable[str]]


@dataclass(frozen=True)
class DocumentPlan:
    collection: str
    owner_id: str
    document_index: int
    action: str
    provider_delivery_type: str | None = None
    flags: tuple[str, ...] = ()


def _is_not_found(exc: Exception) -> bool:
    return getattr(exc, "http_code", None) == 404 or exc.__class__.__name__.lower() in {
        "notfound",
        "notfounderror",
    }


async def _provider_resource_exists(
    public_id: str,
    resource_type: str,
    delivery_type: str,
) -> bool:
    try:
        await asyncio.to_thread(
            cloudinary.api.resource,
            public_id,
            resource_type=resource_type,
            type=delivery_type,
        )
        return True
    except Exception as exc:  # provider SDK exposes several HTTP exception types
        if _is_not_found(exc):
            return False
        raise ProviderLookupUnavailable from exc


async def provider_asset_delivery_type(
    public_id: str,
    resource_type: str,
    declared_delivery_type: str,
) -> str:
    """Resolve one server-owned Cloudinary ID without exposing it in output."""

    order = (PROVIDER_AUTHENTICATED, PROVIDER_UPLOAD)
    for delivery_type in order:
        if await _provider_resource_exists(public_id, resource_type, delivery_type):
            return delivery_type
    raise ProviderAssetMissing


def configure_cloudinary() -> None:
    settings = get_settings()
    if not (
        settings.cloudinary_cloud_name
        and settings.cloudinary_api_key
        and settings.cloudinary_api_secret
    ):
        raise RuntimeError("Cloudinary identity-document credentials are not configured.")
    cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key,
        api_secret=settings.cloudinary_api_secret,
        secure=True,
    )


def aggregate_counts(plans: Iterable[DocumentPlan]) -> Counter[str]:
    counts: Counter[str] = Counter()
    for plan in plans:
        counts["scanned"] += 1
        counts[plan.action] += 1
        for flag in plan.flags:
            counts[flag] += 1
        if plan.action in {"cleanup_only", "authenticated_migration"}:
            counts["eligible"] += 1
        if plan.action == "already_compliant":
            counts["skipped"] += 1
        if plan.action in {
            "missing_provider_asset",
            "ownership_error",
            "malformed",
            "requires_reupload",
            "unsafe_path",
            "provider_lookup_error",
        }:
            counts["blocked"] += 1
    for key in (
        "scanned",
        "already_compliant",
        "eligible",
        "cleanup_only",
        "authenticated_migration",
        "skipped",
        "blocked",
        "missing_provider_asset",
        "requires_reupload",
        "ownership_error",
        "malformed",
        "unsafe_path",
        "invalid_external_url",
        "provider_lookup_error",
    ):
        counts.setdefault(key, 0)
    return counts


async def inspect_identity_documents(
    provider_lookup: ProviderLookup = provider_asset_delivery_type,
) -> tuple[list[DocumentPlan], Counter[str]]:
    plans: list[DocumentPlan] = []
    for collection in DOCUMENT_COLLECTIONS:
        owners = await database.find_many(collection)
        for owner in owners:
            owner_id = str(owner.get("id") or "").strip()
            applicant_id = str(owner.get("user_id") or "").strip()
            documents = owner.get("documents") or []
            if not isinstance(documents, (list, tuple)):
                plans.append(DocumentPlan(collection, owner_id, -1, "malformed"))
                continue
            for index, original in enumerate(documents):
                if not owner_id or not applicant_id:
                    plans.append(DocumentPlan(collection, owner_id, index, "ownership_error"))
                    continue
                if not isinstance(original, dict) or not str(original.get("id") or "").strip():
                    plans.append(DocumentPlan(collection, owner_id, index, "malformed"))
                    continue

                document: Dict[str, Any] = dict(original)
                if document.get("storage_path"):
                    plans.append(
                        DocumentPlan(
                            collection,
                            owner_id,
                            index,
                            "unsafe_path",
                            flags=("requires_reupload",),
                        )
                    )
                    continue

                public_id = str(document.get("cloudinary_public_id") or "").strip()
                if not public_id:
                    flags = ("invalid_external_url",) if any(
                        document.get(field) for field in ("file_url", "url", "secure_url")
                    ) else ()
                    plans.append(
                        DocumentPlan(
                            collection,
                            owner_id,
                            index,
                            "requires_reupload",
                            flags=flags,
                        )
                    )
                    continue

                declared = str(document.get("delivery_type") or "").strip().lower()
                resource_type = str(document.get("resource_type") or "image").strip().lower()
                if resource_type not in {"image", "raw"}:
                    plans.append(DocumentPlan(collection, owner_id, index, "malformed"))
                    continue
                try:
                    provider_delivery = await provider_lookup(public_id, resource_type, declared)
                except ProviderAssetMissing:
                    plans.append(DocumentPlan(collection, owner_id, index, "missing_provider_asset"))
                    continue
                except ProviderLookupUnavailable:
                    plans.append(DocumentPlan(collection, owner_id, index, "provider_lookup_error"))
                    continue

                has_historical_locator = any(
                    document.get(field)
                    for field in ("file_url", "url", "secure_url", "storage_path")
                )
                if provider_delivery == PROVIDER_AUTHENTICATED:
                    action = "cleanup_only" if (declared != PROVIDER_AUTHENTICATED or has_historical_locator) else "already_compliant"
                elif provider_delivery == PROVIDER_UPLOAD:
                    action = "authenticated_migration"
                else:
                    action = "provider_lookup_error"
                plans.append(
                    DocumentPlan(
                        collection,
                        owner_id,
                        index,
                        action,
                        provider_delivery,
                    )
                )

    return plans, aggregate_counts(plans)


def safe_count_lines(counts: Counter[str], *, mode: str) -> list[str]:
    ordered = (
        "scanned",
        "already_compliant",
        "eligible",
        "cleanup_only",
        "authenticated_migration",
        "skipped",
        "blocked",
        "missing_provider_asset",
        "requires_reupload",
        "ownership_error",
        "malformed",
        "unsafe_path",
        "invalid_external_url",
        "provider_lookup_error",
    )
    return [f"mode={mode}", *(f"{key}={int(counts[key])}" for key in ordered)]
