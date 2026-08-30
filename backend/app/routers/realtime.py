from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.config import get_settings
from app.services.auth_service import find_user_by_token
from app.services.realtime_connection_manager import RealtimeConnection, connection_manager, principal_for_user
from app.utils import now_iso


router = APIRouter(tags=["realtime"])
REALTIME_PROTOCOL = "letsgoride.realtime.v1"
AUTH_PROTOCOL_PREFIX = "letsgoride.auth."
settings = get_settings()
logger = logging.getLogger(__name__)


def _protocols(websocket: WebSocket) -> list[str]:
    return [
        item.strip()
        for item in websocket.headers.get("sec-websocket-protocol", "").split(",")
        if item.strip()
    ]


def _has_auth_protocol(websocket: WebSocket) -> bool:
    return any(protocol.startswith(AUTH_PROTOCOL_PREFIX) for protocol in _protocols(websocket))


def _access_token(websocket: WebSocket) -> str:
    authorization = websocket.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    for protocol in _protocols(websocket):
        if protocol.startswith(AUTH_PROTOCOL_PREFIX):
            return protocol[len(AUTH_PROTOCOL_PREFIX):].strip()
    return ""


def _origin_allowed(websocket: WebSocket) -> bool:
    origin = websocket.headers.get("origin", "").strip().rstrip("/")
    allowed = {item.rstrip("/") for item in settings.cors_origins}
    if not origin or origin == "null" or "*" in allowed or origin in allowed:
        return True
    # Native clients authenticate with a bearer-equivalent token carried in the
    # WebSocket subprotocol list. Unlike cookie-authenticated browser sockets,
    # possession of this token is required and is validated before registration.
    # Allowing that authenticated-native handshake avoids false 403s from platform-
    # generated Origin headers while still rejecting untrusted browser origins that
    # do not possess an app session token.
    return _has_auth_protocol(websocket)


async def _authenticate(websocket: WebSocket):
    token = _access_token(websocket)
    if not token or len(token) > 512:
        return None
    user = await find_user_by_token(token)
    if not user:
        return None
    expires_at = user.get("token_expires_at")
    if expires_at:
        try:
            parsed_expiry = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
            if parsed_expiry.tzinfo is None or parsed_expiry <= datetime.now(timezone.utc):
                return None
        except ValueError:
            return None
    return user


async def _handle_client_message(connection: RealtimeConnection, raw_message: str) -> None:
    websocket = connection.websocket
    try:
        message = json.loads(raw_message)
    except (TypeError, json.JSONDecodeError):
        await connection_manager.send_control(connection, {"type": "realtime.error", "code": "malformed_message"})
        return
    if not isinstance(message, dict) or not isinstance(message.get("type"), str):
        await connection_manager.send_control(connection, {"type": "realtime.error", "code": "malformed_message"})
        return
    if message["type"] == "realtime.pong":
        connection_manager.touch(websocket)
        return
    if message["type"] == "realtime.ack" and isinstance(message.get("event_id"), str):
        connection_manager.touch(websocket)
        return
    await connection_manager.send_control(connection, {"type": "realtime.error", "code": "unsupported_message"})


@router.websocket("/realtime")
async def realtime_socket(websocket: WebSocket):
    if not _origin_allowed(websocket):
        origin = websocket.headers.get("origin", "").strip()
        logger.warning(
            "realtime_ws_rejected reason=origin origin=%s has_auth_protocol=%s",
            origin[:160] if origin else "<empty>",
            _has_auth_protocol(websocket),
        )
        await websocket.close(code=4403)
        return
    user = await _authenticate(websocket)
    if not user:
        logger.warning(
            "realtime_ws_rejected reason=authentication has_authorization=%s has_auth_protocol=%s",
            websocket.headers.get("authorization", "").lower().startswith("bearer "),
            _has_auth_protocol(websocket),
        )
        await websocket.close(code=4401)
        return

    offered_protocols = _protocols(websocket)
    selected_protocol = REALTIME_PROTOCOL if REALTIME_PROTOCOL in offered_protocols else None
    await websocket.accept(subprotocol=selected_protocol)
    principal = await principal_for_user(user)
    connection = await connection_manager.register(websocket, principal)
    logger.info(
        "realtime_ws_connected user_id=%s role=%s protocol=%s",
        user.get("id"),
        user.get("role"),
        selected_protocol or "none",
    )
    await connection_manager.send_control(
        connection,
        {
            "type": "realtime.ready",
            "connection_id": connection.connection_id,
            "heartbeat_seconds": connection_manager.heartbeat_seconds,
            "connected_at": now_iso(),
        },
    )
    heartbeat_task = asyncio.create_task(connection_manager.heartbeat(connection))
    try:
        while True:
            raw_message = await websocket.receive_text()
            connection_manager.touch(websocket)
            await _handle_client_message(connection, raw_message)
    except WebSocketDisconnect:
        pass
    finally:
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except asyncio.CancelledError:
            pass
        await connection_manager.unregister(websocket)
