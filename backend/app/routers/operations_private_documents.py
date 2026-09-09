from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse, Response

from app.auth import get_current_user
from app.database import database
from app.services.private_document_service import contained_legacy_document_path, private_provider_document_bytes
from app.utils import api_error


router = APIRouter(prefix="/operations", tags=["operations"])


def _require_admin(user) -> None:
    if user.get("role") != "admin":
        api_error("Administrator access is required.", 403)


@router.get("/admin/applications/{application_id}/documents/{document_id}")
async def admin_worker_document(
    application_id: str,
    document_id: str,
    user=Depends(get_current_user),
):
    """Serve a private workforce document through authenticated Ops access.

    Unlike the one-time browser-link route retained for mobile compatibility,
    this endpoint keeps credentials in the Authorization header so they are not
    copied into infrastructure request URLs/logs.
    """
    _require_admin(user)
    application = await database.find_one("worker_applications", {"id": application_id})
    document = next((item for item in (application or {}).get("documents", []) if item.get("id") == document_id), None)
    if not document:
        api_error("Document not found.", 404)

    if document.get("cloudinary_public_id"):
        try:
            content, media_type = await asyncio.to_thread(private_provider_document_bytes, document)
        except Exception:
            api_error("Document file is unavailable. The applicant may need to re-upload.", 404)
        return Response(content=content, media_type=media_type, headers={"Cache-Control": "no-store"})

    try:
        path = contained_legacy_document_path(document)
    except (FileNotFoundError, OSError):
        api_error("Document file is unavailable. The applicant may need to re-upload.", 404)
    return FileResponse(
        path,
        media_type=document.get("content_type") or "application/octet-stream",
        filename=document.get("file_name") or "application-document",
        headers={"Cache-Control": "no-store"},
    )
