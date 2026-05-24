import asyncio
import json
import logging
from urllib import error, request

from app.config import get_settings


logger = logging.getLogger(__name__)


def _send_resend_email(to_email: str, subject: str, text: str) -> bool:
    settings = get_settings()
    if not settings.resend_api_key or not settings.resend_from_email:
        logger.warning("Email verification failed: missing Resend configuration")
        return False

    payload = {
        "from": settings.resend_from_email,
        "to": [to_email],
        "subject": subject,
        "text": text,
    }
    if settings.resend_reply_to:
        payload["reply_to"] = settings.resend_reply_to

    data = json.dumps(payload).encode("utf-8")
    req = request.Request(
        "https://api.resend.com/emails",
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {settings.resend_api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with request.urlopen(req, timeout=10) as response:
            sent = 200 <= response.status < 300
            if sent:
                logger.info("Email verification sent to user email")
            return sent
    except error.HTTPError as exc:
        if exc.code in (401, 403, 422):
            logger.warning("Email verification failed: Resend rejected sender")
        else:
            logger.warning("Email verification failed: Resend request rejected")
        return False


async def send_verification_email(to_email: str, code: str) -> bool:
    subject = "Verify your LetsGoRide email"
    text = (
        f"Your LetsGoRide verification code is: {code}\n\n"
        "This code expires in 15 minutes."
    )
    try:
        return await asyncio.to_thread(_send_resend_email, to_email, subject, text)
    except Exception:
        logger.warning("Email verification failed: Resend request rejected")
        return False
