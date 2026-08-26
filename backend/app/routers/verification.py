import logging

from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.auth import get_current_user
from app.config import get_settings
from app.models.verification import DocumentType, VerificationSubmitBody
from app.services.verification_service import (
    VerificationUploadError,
    cloudinary_configuration_status,
    get_driver_for_user,
    get_or_create_liveness_challenge,
    public_verification,
    save_uploaded_document,
    submit_manual_verification,
)
from app.utils import api_error, api_success


router = APIRouter(prefix="/verification", tags=["verification"])
logger = logging.getLogger(__name__)


@router.get("/me")
async def my_verification(user=Depends(get_current_user)):
    driver = await get_driver_for_user(user)
    return api_success(public_verification(driver))


@router.get("/cloudinary/status")
async def verification_cloudinary_status(user=Depends(get_current_user)):
    settings = get_settings()
    if settings.app_env == "production" and user.get("role") != "admin":
        api_error("Admin access is required.", 403)
    status = cloudinary_configuration_status()
    logger.info(
        "verification_upload stage=cloudinary_status_checked user_id=%s role=%s configured=%s cloud_name_present=%s api_key_present=%s api_secret_present=%s",
        user.get("id"),
        user.get("role"),
        status["configured"],
        status["cloud_name_present"],
        status["api_key_present"],
        status["api_secret_present"],
    )
    return api_success(status)


@router.post("/liveness/challenge")
async def liveness_challenge(user=Depends(get_current_user)):
    return api_success(await get_or_create_liveness_challenge(user))


@router.post("/manual/submit")
async def submit_manual(payload: VerificationSubmitBody, user=Depends(get_current_user)):
    if not payload.consent:
        api_error("Consent is required before submitting verification documents.")
    driver = await submit_manual_verification(user, payload.model_dump())
    return api_success(public_verification(driver))


@router.post("/manual/upload")
async def upload_manual_document(
    document_type: DocumentType = Form(...),
    file: UploadFile = File(...),
    user=Depends(get_current_user),
):
    return await _upload_document(document_type, file, user)


@router.post("/upload")
async def upload_document(
    document_type: DocumentType = Form(...),
    file: UploadFile = File(...),
    user=Depends(get_current_user),
):
    return await _upload_document(document_type, file, user)


async def _upload_document(document_type: DocumentType, file: UploadFile, user):
    logger.info(
        "verification_upload stage=auth_user_loaded user_id=%s role=%s",
        user.get("id"),
        user.get("role"),
    )
    logger.info(
        "verification_upload stage=multipart_file_received user_id=%s document_type=%s content_type=%s",
        user.get("id"),
        document_type,
        file.content_type or "missing",
    )
    try:
        uploaded = await save_uploaded_document(user, document_type, file)
    except VerificationUploadError as error:
        logger.warning(
            "verification_upload stage=%s user_id=%s document_type=%s error_type=%s",
            error.stage,
            user.get("id"),
            document_type,
            error.error_type,
        )
        api_error(
            error.message,
            error.status_code,
            stage=error.stage,
            document_type=document_type,
        )
    except Exception as error:
        logger.error(
            "verification_upload stage=unexpected user_id=%s document_type=%s error_type=%s",
            user.get("id"),
            document_type,
            type(error).__name__,
        )
        api_error(
            "Unexpected verification upload failure.",
            502,
            stage="unexpected",
            document_type=document_type,
        )
    return api_success(uploaded)
