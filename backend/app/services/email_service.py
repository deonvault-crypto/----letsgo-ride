import asyncio
from html import escape
import json
import logging
import re
from urllib import error, request

from app.config import get_settings


logger = logging.getLogger(__name__)
RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails"


def _safe_error_body(raw_body: str, resend_key: str, to_email: str) -> str:
    body = raw_body.replace("\r", " ").replace("\n", " ").strip()
    if resend_key:
        body = body.replace(resend_key, "[redacted]")
    if to_email:
        body = body.replace(to_email, "user email")
    body = re.sub(r"Bearer\s+[A-Za-z0-9._-]+", "Bearer [redacted]", body)
    body = re.sub(r"\b\d{6}\b", "[redacted-code]", body)
    return body[:500]


def _resend_log_context(
    action: str,
    status_code: int | None = None,
    message: str = "",
    payload_keys: list[str] | None = None,
    to_count: int = 0,
) -> str:
    settings = get_settings()
    return (
        f"provider=resend action={action} endpoint={RESEND_EMAIL_ENDPOINT} status_code={status_code} "
        f"payload_keys={','.join(payload_keys or []) or 'none'} "
        f"message={message or 'none'} "
        f"from_email={settings.resend_from_email or 'missing'} "
        f"reply_to_email={settings.resend_reply_to or 'missing'} "
        f"to_count={to_count} "
        f"api_key_present={settings.resend_api_key_present} "
        f"api_key_prefix_ok={settings.resend_api_key_prefix_ok} "
        f"api_key_length={settings.resend_api_key_length}"
    )


def _send_resend_email(to_email: str, subject: str, html: str, text: str, action: str = "send_email") -> bool:
    settings = get_settings()
    if not settings.resend_api_key or not settings.resend_from_email:
        logger.warning(
            "Email verification failed: missing Resend configuration %s",
            _resend_log_context(action, message="missing Resend configuration"),
        )
        return False

    payload = {
        "from": settings.resend_from_email,
        "to": [to_email],
        "subject": subject,
        "html": html,
        "text": text,
    }

    data = json.dumps(payload).encode("utf-8")
    payload_keys = list(payload.keys())
    logger.info(
        "Email verification send request %s",
        _resend_log_context(action, message="sending", payload_keys=payload_keys, to_count=1),
    )
    req = request.Request(
        RESEND_EMAIL_ENDPOINT,
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {settings.resend_api_key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "LetsGoRideBackend/1.0",
        },
    )
    try:
        with request.urlopen(req, timeout=10) as response:
            body = _safe_error_body(response.read().decode("utf-8", errors="replace"), settings.resend_api_key, to_email)
            sent = 200 <= response.status < 300
            if sent:
                logger.info(
                    "Email verification sent to user email %s",
                    _resend_log_context(action, status_code=response.status, message=body or "sent", payload_keys=payload_keys, to_count=1),
                )
            else:
                logger.warning(
                    "Email verification failed: Resend request rejected %s",
                    _resend_log_context(action, status_code=response.status, message=body or "request rejected", payload_keys=payload_keys, to_count=1),
                )
            return sent
    except error.HTTPError as exc:
        body = _safe_error_body(exc.read().decode("utf-8", errors="replace"), settings.resend_api_key, to_email)
        if exc.code in (401, 403, 422):
            logger.warning(
                "Email verification failed: Resend rejected sender %s",
                _resend_log_context(action, status_code=exc.code, message=body or "Resend rejected sender", payload_keys=payload_keys, to_count=1),
            )
        else:
            logger.warning(
                "Email verification failed: Resend request rejected %s",
                _resend_log_context(action, status_code=exc.code, message=body or "Resend request rejected", payload_keys=payload_keys, to_count=1),
            )
        return False
    except Exception as exc:
        logger.warning(
            "Email verification failed: Resend request rejected %s",
            _resend_log_context(
                action,
                message=_safe_error_body(str(exc), settings.resend_api_key, to_email),
                payload_keys=payload_keys,
                to_count=1,
            ),
        )
        return False


async def send_verification_email(to_email: str, code: str) -> bool:
    subject = "Verify your LetsGoRide email"
    text = (
        f"Your LetsGoRide verification code is: {code}\n\n"
        "This code expires in 15 minutes."
    )
    html = (
        "<p>Your LetsGoRide verification code is: "
        f"<strong>{escape(code)}</strong></p>"
        "<p>This code expires in 15 minutes.</p>"
    )
    try:
        return await asyncio.to_thread(_send_resend_email, to_email, subject, html, text, "send_verification_email")
    except Exception:
        logger.warning(
            "Email verification failed: Resend request rejected %s",
            _resend_log_context("send_verification_email", message="unexpected email service error"),
        )
        return False
