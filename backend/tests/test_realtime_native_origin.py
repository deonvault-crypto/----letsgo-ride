import unittest
from unittest.mock import AsyncMock, patch

from fastapi import WebSocketDisconnect

from app.routers.realtime import realtime_socket


class FakeWebSocket:
    def __init__(self, headers=None):
        self.headers = headers or {}
        self.accepted = False
        self.accepted_subprotocol = None
        self.closed_code = None
        self.sent = []

    async def accept(self, subprotocol=None):
        self.accepted = True
        self.accepted_subprotocol = subprotocol

    async def close(self, code=1000):
        self.closed_code = code

    async def send_json(self, message):
        self.sent.append(message)

    async def receive_text(self):
        raise WebSocketDisconnect(code=1000)


class RealtimeNativeOriginTests(unittest.IsolatedAsyncioTestCase):
    async def test_native_token_protocol_can_authenticate_with_platform_generated_origin(self):
        socket = FakeWebSocket(
            headers={
                "origin": "http://localhost",
                "sec-websocket-protocol": "letsgoride.realtime.v1, letsgoride.auth.acct_valid",
            }
        )
        with patch(
            "app.routers.realtime.find_user_by_token",
            new=AsyncMock(return_value={"id": "driver-1", "role": "driver"}),
        ):
            await realtime_socket(socket)

        self.assertTrue(socket.accepted)
        self.assertEqual(socket.accepted_subprotocol, "letsgoride.realtime.v1")
        self.assertEqual(socket.sent[0]["type"], "realtime.ready")

    async def test_untrusted_browser_origin_without_native_auth_protocol_is_still_rejected(self):
        socket = FakeWebSocket(
            headers={
                "origin": "https://attacker.example",
                "authorization": "Bearer valid",
            }
        )
        await realtime_socket(socket)

        self.assertFalse(socket.accepted)
        self.assertEqual(socket.closed_code, 4403)


if __name__ == "__main__":
    unittest.main()
