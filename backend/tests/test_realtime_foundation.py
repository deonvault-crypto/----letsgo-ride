import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

from fastapi import WebSocketDisconnect
from pydantic import ValidationError

from app.models.event import RealtimeAudience
from app.routers.realtime import _handle_client_message, realtime_socket
from app.services.event_service import RealtimeEventService
from app.services.pubsub_service import PubSubTransport, RedisPubSubTransport
from app.services.realtime_connection_manager import (
    RealtimeConnectionManager,
    RealtimePrincipal,
    connection_manager,
    principal_can_receive,
)


class FakeWebSocket:
    def __init__(self, headers=None, messages=None, fail_send=False):
        self.headers = headers or {}
        self.messages = list(messages or [])
        self.sent = []
        self.accepted = False
        self.accepted_subprotocol = None
        self.closed_code = None
        self.fail_send = fail_send

    async def accept(self, subprotocol=None):
        self.accepted = True
        self.accepted_subprotocol = subprotocol

    async def close(self, code=1000):
        self.closed_code = code

    async def send_json(self, message):
        if self.fail_send:
            raise RuntimeError("socket unavailable")
        self.sent.append(message)

    async def receive_text(self):
        if self.messages:
            return self.messages.pop(0)
        raise WebSocketDisconnect(code=1000)


class InMemoryTestTransport(PubSubTransport):
    """Test-only transport; production always uses RedisPubSubTransport."""

    def __init__(self):
        self.handler = None
        self.started = False

    @property
    def available(self):
        return self.started

    async def start(self, handler):
        self.handler = handler
        self.started = True

    async def publish(self, event):
        if not self.handler:
            return False
        await self.handler(event)
        return True

    async def close(self):
        self.started = False
        self.handler = None


class RealtimeFoundationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncTearDown(self):
        for connection in list(connection_manager._connections.values()):
            await connection_manager.unregister(connection.websocket)

    async def test_authenticated_socket_is_accepted_registered_and_removed(self):
        socket = FakeWebSocket(
            headers={
                "sec-websocket-protocol": "letsgoride.realtime.v1, letsgoride.auth.acct_valid"
            }
        )
        with patch(
            "app.routers.realtime.find_user_by_token",
            new=AsyncMock(return_value={"id": "user-1", "role": "passenger"}),
        ):
            await realtime_socket(socket)

        self.assertTrue(socket.accepted)
        self.assertEqual(socket.accepted_subprotocol, "letsgoride.realtime.v1")
        self.assertEqual(socket.sent[0]["type"], "realtime.ready")
        self.assertEqual(connection_manager.connection_count, 0)

    async def test_unauthenticated_and_invalid_tokens_are_rejected(self):
        missing = FakeWebSocket()
        await realtime_socket(missing)
        self.assertFalse(missing.accepted)
        self.assertEqual(missing.closed_code, 4401)

        invalid = FakeWebSocket(headers={"authorization": "Bearer invalid"})
        with patch("app.routers.realtime.find_user_by_token", new=AsyncMock(return_value=None)):
            await realtime_socket(invalid)
        self.assertFalse(invalid.accepted)
        self.assertEqual(invalid.closed_code, 4401)

    async def test_expired_token_is_rejected(self):
        socket = FakeWebSocket(headers={"authorization": "Bearer expired"})
        expired = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
        with patch(
            "app.routers.realtime.find_user_by_token",
            new=AsyncMock(return_value={"id": "user-1", "role": "passenger", "token_expires_at": expired}),
        ):
            await realtime_socket(socket)
        self.assertFalse(socket.accepted)
        self.assertEqual(socket.closed_code, 4401)

    async def test_disallowed_web_origin_is_rejected(self):
        socket = FakeWebSocket(headers={"origin": "https://attacker.example", "authorization": "Bearer valid"})
        await realtime_socket(socket)
        self.assertFalse(socket.accepted)
        self.assertEqual(socket.closed_code, 4403)

    async def test_connection_manager_avoids_duplicate_registration_and_cleans_up(self):
        manager = RealtimeConnectionManager()
        socket = FakeWebSocket()
        principal = RealtimePrincipal("user-1", "passenger")
        first = await manager.register(socket, principal)
        second = await manager.register(socket, principal)
        self.assertIs(first, second)
        self.assertEqual(manager.connection_count, 1)
        await manager.unregister(socket)
        self.assertEqual(manager.connection_count, 0)

    async def test_dead_connection_is_removed_when_send_fails(self):
        manager = RealtimeConnectionManager()
        socket = FakeWebSocket(fail_send=True)
        connection = await manager.register(socket, RealtimePrincipal("user-1", "passenger"))
        self.assertFalse(await manager.send_control(connection, {"type": "realtime.ping"}))
        self.assertEqual(manager.connection_count, 0)
        self.assertEqual(socket.closed_code, 1011)

    async def test_unconfigured_shared_transport_degrades_without_local_fallback(self):
        transport = RedisPubSubTransport("", "test:realtime")

        async def handler(_event):
            return None

        await transport.start(handler)
        self.assertFalse(transport.available)
        service = RealtimeEventService(transport)
        event = service.build_event(
            event_type="diagnostic.updated",
            resource_type="diagnostic",
            resource_id="test-1",
            version=1,
            audience=RealtimeAudience(user_ids=frozenset({"user-1"})),
        )
        self.assertFalse(await transport.publish(event))
        await transport.close()

    async def test_event_envelope_and_protected_payload_validation(self):
        service = RealtimeEventService(InMemoryTestTransport())
        event = service.build_event(
            event_type="courier_delivery.updated",
            resource_type="courier_delivery",
            resource_id="delivery-1",
            version=12,
            audience=RealtimeAudience(user_ids=frozenset({"user-1"})),
            payload={"status": "IN_TRANSIT", "remaining_eta_minutes": 8},
        )
        self.assertEqual(event.envelope.version, 12)
        self.assertNotIn("audience", event.envelope.model_dump())

        with self.assertRaises(ValidationError):
            service.build_event(
                event_type="courier_delivery.updated",
                resource_type="courier_delivery",
                resource_id="delivery-1",
                version=13,
                audience=RealtimeAudience(user_ids=frozenset({"user-1"})),
                payload={"handoff_pin": "1234"},
            )
        with self.assertRaises(ValidationError):
            service.build_event(
                event_type="account.updated",
                resource_type="account",
                resource_id="user-1",
                version=1,
                audience=RealtimeAudience(user_ids=frozenset({"user-1"})),
                payload={"reset_code_hash": "protected"},
            )

    def test_audience_authorization_has_no_cross_user_leakage(self):
        customer = RealtimePrincipal("customer-1", "passenger")
        other_customer = RealtimePrincipal("customer-2", "passenger")
        merchant = RealtimePrincipal("merchant-1", "merchant", frozenset({"restaurant-1"}))
        admin = RealtimePrincipal("admin-1", "admin")

        self.assertTrue(principal_can_receive(customer, RealtimeAudience(user_ids=frozenset({"customer-1"}))))
        self.assertFalse(principal_can_receive(other_customer, RealtimeAudience(user_ids=frozenset({"customer-1"}))))
        self.assertTrue(principal_can_receive(merchant, RealtimeAudience(restaurant_ids=frozenset({"restaurant-1"}))))
        self.assertFalse(principal_can_receive(customer, RealtimeAudience(restaurant_ids=frozenset({"restaurant-1"}))))
        self.assertTrue(principal_can_receive(admin, RealtimeAudience(admin_only=True)))
        self.assertFalse(principal_can_receive(customer, RealtimeAudience(admin_only=True)))

    async def test_test_transport_fans_out_only_to_authorized_socket(self):
        authorized_socket = FakeWebSocket()
        other_socket = FakeWebSocket()
        await connection_manager.register(authorized_socket, RealtimePrincipal("user-1", "passenger"))
        await connection_manager.register(other_socket, RealtimePrincipal("user-2", "passenger"))
        transport = InMemoryTestTransport()
        service = RealtimeEventService(transport)
        await service.start()
        event = service.build_event(
            event_type="diagnostic.updated",
            resource_type="diagnostic",
            resource_id="test-1",
            version=1,
            audience=RealtimeAudience(user_ids=frozenset({"user-1"})),
            payload={"status": "ok"},
        )
        self.assertTrue(await service.publish(event))
        self.assertEqual([item["event_id"] for item in authorized_socket.sent], [event.envelope.event_id])
        self.assertEqual(other_socket.sent, [])
        await service.close()

    async def test_malformed_and_unsupported_messages_are_safe(self):
        socket = FakeWebSocket()
        connection = await connection_manager.register(socket, RealtimePrincipal("user-1", "passenger"))
        await _handle_client_message(connection, "not-json")
        await _handle_client_message(connection, '{"type":"subscribe","resource_id":"other-user"}')
        self.assertEqual(socket.sent[0]["code"], "malformed_message")
        self.assertEqual(socket.sent[1]["code"], "unsupported_message")


if __name__ == "__main__":
    unittest.main()
