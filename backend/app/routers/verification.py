from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.auth import get_current_user
from app.models.verification import DocumentType, VerificationSubmitBody
from app.services.verification_service import (
    get_driver_for_user,
    public_verification,
    save_uploaded_document,
    submit_manual_verification,
)
from app.utils import api_error, api_success


router = APIRouter(prefix="/verification", tags=["verification"])


@router.get("/me")
async def my_verification(user=Depends(get_current_user)):
    driver = await get_driver_for_user(user)
    return api_success(public_verification(driver))


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
    uploaded = await save_uploaded_document(user, document_type, file)
    return api_success(uploaded)


@router.post("/upload")
async def upload_document(
    document_type: DocumentType = Form(...),
    file: UploadFile = File(...),
    user=Depends(get_current_user),
):
    uploaded = await save_uploaded_document(user, document_type, file)
    return api_success(uploaded)
