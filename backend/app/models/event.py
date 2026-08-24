from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, FrozenSet

from pydantic import BaseModel, Field, field_validator, model_validator


SENSITIVE_PAYLOAD_FRAGMENTS = {
    "api_key",
    "authorization",
    "document_url",
    "handoff_pin",
    "jwt",
    "otp",
    "password",
    "password_hash",
    "password_salt",
    "private_document",
    "reset_code",
    "secret",
    "token",
    "verification_code",
}
MAX_EVENT_PAYLOAD_BYTES = 16_384
VALID_REALTIME_ROLES = {"passenger", "driver", "courier", "merchant", "admin"}


def _key_is_sensitive(key: str) -> bool:
    normalized = key.strip().lower()
    if any(fragment in normalized for fragment in SENSITIVE_PAYLOAD_FRAGMENTS - {"pin"}):
        return True
    return "pin" in normalized.replace("-", "_").split("_")


def _contains_sensitive_key(value: Any) -> bool:
    if isinstance(value, dict):
        for key, nested in value.items():
            if _key_is_sensitive(str(key)):
                return True
            if _contains_sensitive_key(nested):
                return True
    elif isinstance(value, (list, tuple)):
        return any(_contains_sensitive_key(item) for item in value)
    return False


class RealtimeEventEnvelope(BaseModel):
    event_id: str = Field(min_length=1, max_length=100)
    type: str = Field(pattern=r"^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$", max_length=120)
    resource_type: str = Field(pattern=r"^[a-z][a-z0-9_]*$", max_length=80)
    resource_id: str = Field(min_length=1, max_length=120)
    version: int = Field(ge=1)
    occurred_at: str = Field(min_length=1, max_length=64)
    payload: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("occurred_at")
    @classmethod
    def occurred_at_is_iso8601(cls, value: str) -> str:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            raise ValueError("Realtime event timestamps require a timezone.")
        return value

    @model_validator(mode="after")
    def payload_is_safe_and_small(self) -> "RealtimeEventEnvelope":
        if _contains_sensitive_key(self.payload):
            raise ValueError("Realtime event payload contains a protected field.")
        encoded = json.dumps(self.payload, separators=(",", ":"), ensure_ascii=True)
        if len(encoded.encode("utf-8")) > MAX_EVENT_PAYLOAD_BYTES:
            raise ValueError("Realtime event payload is too large.")
        return self


class RealtimeAudience(BaseModel):
    user_ids: FrozenSet[str] = Field(default_factory=frozenset)
    restaurant_ids: FrozenSet[str] = Field(default_factory=frozenset)
    roles: FrozenSet[str] = Field(default_factory=frozenset)
    admin_only: bool = False

    @model_validator(mode="after")
    def audience_is_scoped(self) -> "RealtimeAudience":
        if not (self.user_ids or self.restaurant_ids or self.roles or self.admin_only):
            raise ValueError("Realtime events require an explicit audience.")
        if any(not item.strip() for item in (*self.user_ids, *self.restaurant_ids)):
            raise ValueError("Realtime audience identifiers cannot be blank.")
        if not self.roles.issubset(VALID_REALTIME_ROLES):
            raise ValueError("Realtime audience contains an unsupported role.")
        return self


class PublishedRealtimeEvent(BaseModel):
    envelope: RealtimeEventEnvelope
    audience: RealtimeAudience
