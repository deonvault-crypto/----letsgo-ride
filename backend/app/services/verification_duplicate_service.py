from __future__ import annotations

import re
from collections.abc import Callable, Mapping
from typing import Any, Dict, List

from app.database import database


DocumentNormalizer = Callable[[Any], List[Dict[str, Any]]]


def _exact_text_pattern(value: str) -> str:
    return rf"^\s*{re.escape(value)}\s*$"


def _clean_mongo_row(row: Dict[str, Any]) -> Dict[str, Any]:
    cleaned = dict(row)
    cleaned.pop("_id", None)
    return cleaned


async def _candidate_users(*, current_user_id: str, phone: str, email: str) -> List[Dict[str, Any]]:
    if database.db is None:
        return await database.find_many("users")

    conditions: List[Dict[str, Any]] = []
    if phone:
        conditions.append({"phone": {"$regex": _exact_text_pattern(phone)}})
    if email:
        conditions.extend(
            [
                {"normalized_email": email},
                {"email": {"$regex": _exact_text_pattern(email), "$options": "i"}},
            ]
        )
    if not conditions:
        return []

    cursor = database.db["users"].find(
        {"id": {"$ne": current_user_id}, "$or": conditions},
        {"_id": 0, "id": 1, "phone": 1, "email": 1, "normalized_email": 1},
    )
    return [_clean_mongo_row(row) async for row in cursor]


async def _candidate_drivers(
    *,
    current_driver_id: str,
    phone: str,
    email: str,
    public_ids: set[str],
    identity_number: str,
    licence_number: str,
    plate_number: str,
) -> List[Dict[str, Any]]:
    if database.db is None:
        return await database.find_many("drivers")

    conditions: List[Dict[str, Any]] = []
    if phone:
        conditions.append({"phone": {"$regex": _exact_text_pattern(phone)}})
    if email:
        conditions.append({"email": {"$regex": _exact_text_pattern(email), "$options": "i"}})
    if public_ids:
        conditions.append({"documents.cloudinary_public_id": {"$in": sorted(public_ids)}})
    if identity_number:
        conditions.append(
            {
                "documents.ocr.extracted_fields.document_number": {
                    "$regex": _exact_text_pattern(identity_number),
                    "$options": "i",
                }
            }
        )
    if licence_number:
        conditions.append(
            {
                "documents.ocr.extracted_fields.licence_number": {
                    "$regex": _exact_text_pattern(licence_number),
                    "$options": "i",
                }
            }
        )
    if plate_number:
        conditions.append(
            {
                "documents.ocr.extracted_fields.plate_number": {
                    "$regex": _exact_text_pattern(plate_number),
                    "$options": "i",
                }
            }
        )

    # Older records may store documents as a keyed object instead of the current
    # list shape. Include only those compatibility records in the candidate set
    # so the Python equality checks below preserve legacy duplicate semantics.
    if public_ids or identity_number or licence_number or plate_number:
        conditions.append({"documents": {"$type": "object"}})

    if not conditions:
        return []

    cursor = database.db["drivers"].find(
        {"id": {"$ne": current_driver_id}, "$or": conditions},
        {"_id": 0, "id": 1, "phone": 1, "email": 1, "documents": 1},
    )
    return [_clean_mongo_row(row) async for row in cursor]


def _dedupe(flags: List[str]) -> List[str]:
    return list(dict.fromkeys(flag for flag in flags if flag))


async def detect_duplicate_flags(
    *,
    user: Dict[str, Any],
    driver: Dict[str, Any],
    documents: List[Dict[str, Any]],
    extracted_fields: Dict[str, Any],
    normalize_documents: DocumentNormalizer,
) -> List[str]:
    """Find duplicate verification signals without loading whole production collections.

    The in-memory adapter deliberately keeps the historical full-scan behavior so
    tests and development preserve exact semantics. Production MongoDB first narrows
    to candidates using indexed/exact fields and nested document matches, then runs
    the same normalized Python comparisons as the legacy implementation.
    """
    flags: List[str] = []
    phone = str(user.get("phone") or driver.get("phone") or "").strip()
    email = str(user.get("email") or driver.get("email") or "").strip().lower()

    users = await _candidate_users(
        current_user_id=str(user.get("id") or ""),
        phone=phone,
        email=email,
    )
    for other in users:
        if other.get("id") == user.get("id"):
            continue
        if phone and str(other.get("phone") or "").strip() == phone:
            flags.append("duplicate_phone")
        if email and str(other.get("email") or "").strip().lower() == email:
            flags.append("duplicate_email")

    current_public_ids = {
        str(document.get("cloudinary_public_id"))
        for document in documents
        if document.get("cloudinary_public_id")
    }
    identity_number = str(extracted_fields.get("document_number") or "").strip().lower()
    licence_number = str(extracted_fields.get("licence_number") or "").strip().lower()
    plate_number = str(extracted_fields.get("plate_number") or "").strip().lower()

    drivers = await _candidate_drivers(
        current_driver_id=str(driver.get("id") or ""),
        phone=phone,
        email=email,
        public_ids=current_public_ids,
        identity_number=identity_number,
        licence_number=licence_number,
        plate_number=plate_number,
    )
    for other in drivers:
        if other.get("id") == driver.get("id"):
            continue
        if phone and str(other.get("phone") or "").strip() == phone:
            flags.append("duplicate_phone")
        if email and str(other.get("email") or "").strip().lower() == email:
            flags.append("duplicate_email")
        for other_document in normalize_documents(other.get("documents", [])):
            public_id = other_document.get("cloudinary_public_id")
            if public_id and str(public_id) in current_public_ids:
                flags.append("duplicate_cloudinary_public_id")
            other_ocr = other_document.get("ocr")
            if not isinstance(other_ocr, Mapping):
                continue
            other_fields = other_ocr.get("extracted_fields")
            if not isinstance(other_fields, Mapping):
                continue
            if identity_number and str(other_fields.get("document_number") or "").strip().lower() == identity_number:
                flags.append("duplicate_identity_document_number")
            if licence_number and str(other_fields.get("licence_number") or "").strip().lower() == licence_number:
                flags.append("duplicate_driver_licence_number")
            if plate_number and str(other_fields.get("plate_number") or "").strip().lower() == plate_number:
                flags.append("duplicate_vehicle_plate")

    return _dedupe(flags)
