from __future__ import annotations

import io
from dataclasses import dataclass
from pathlib import Path

from fastapi import UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError


IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
DOCUMENT_TYPES = IMAGE_TYPES | {"application/pdf"}


@dataclass(frozen=True)
class ValidatedUpload:
    data: bytes
    content_type: str
    file_name: str
    resource_type: str
    format: str


async def read_bounded(upload: UploadFile, max_bytes: int) -> bytes:
    chunks: list[bytes] = []
    size = 0
    while True:
        chunk = await upload.read(min(64 * 1024, max_bytes + 1 - size))
        if not chunk:
            break
        size += len(chunk)
        if size > max_bytes:
            raise ValueError(f"The upload must be {max_bytes // (1024 * 1024)} MB or smaller.")
        chunks.append(chunk)
    data = b"".join(chunks)
    if not data:
        raise ValueError("The uploaded file is empty.")
    return data


def _actual_type(data: bytes) -> str:
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data.lstrip().startswith(b"%PDF-"):
        return "application/pdf"
    return "application/octet-stream"


def sanitize_image(data: bytes, *, max_pixels: int = 25_000_000) -> ValidatedUpload:
    try:
        with Image.open(io.BytesIO(data)) as source:
            source.verify()
        with Image.open(io.BytesIO(data)) as source:
            if source.width * source.height > max_pixels:
                raise ValueError("The image dimensions are too large.")
            image = ImageOps.exif_transpose(source).convert("RGB")
            output = io.BytesIO()
            image.save(output, format="JPEG", quality=90, optimize=True)
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise ValueError("The uploaded image is not a valid JPG, PNG, or WebP file.") from exc
    return ValidatedUpload(output.getvalue(), "image/jpeg", "upload.jpg", "image", "jpg")


async def validate_upload(upload: UploadFile, *, max_bytes: int, allow_pdf: bool, stem: str) -> ValidatedUpload:
    data = await read_bounded(upload, max_bytes)
    actual = _actual_type(data)
    allowed = DOCUMENT_TYPES if allow_pdf else IMAGE_TYPES
    if actual not in allowed:
        raise ValueError("Upload a valid JPG, PNG, WebP" + (" or PDF" if allow_pdf else "") + " file.")
    declared = str(upload.content_type or "").lower()
    if declared and declared not in allowed:
        raise ValueError("The uploaded file type is not allowed.")
    safe_stem = "".join(character for character in Path(stem).stem if character.isalnum() or character in "-_") or "document"
    if actual == "application/pdf":
        if b"%%EOF" not in data[-2048:]:
            raise ValueError("The uploaded PDF is incomplete or invalid.")
        return ValidatedUpload(data, actual, f"{safe_stem}.pdf", "raw", "pdf")
    image = sanitize_image(data)
    return ValidatedUpload(image.data, image.content_type, f"{safe_stem}.jpg", image.resource_type, image.format)
