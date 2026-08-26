from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass
from typing import Optional

from fastapi import HTTPException, Request

from app.config import get_settings
from app.utils import api_error


@dataclass(frozen=True)
class RateLimit:
    requests: int
    window_seconds: int


class RateLimitService:
    """Shared fixed-window limits. Production fails closed if shared Redis is unavailable."""

    def __init__(self) -> None:
        self._client = None
        self._memory: dict[str, tuple[int, float]] = {}

    @staticmethod
    def _opaque(value: str) -> str:
        return hashlib.sha256(value.strip().lower().encode("utf-8")).hexdigest()[:32]

    @staticmethod
    def client_ip(request: Request) -> str:
        # Uvicorn/Render resolves trusted proxy headers before constructing the
        # Request. Reading X-Forwarded-For directly would let clients spoof keys.
        return request.client.host if request.client else "unknown"

    async def enforce(self, request: Request, scope: str, limit: RateLimit, *, identity: Optional[str] = None) -> None:
        keys = [f"lgr:rate:{scope}:ip:{self._opaque(self.client_ip(request))}"]
        if identity:
            keys.append(f"lgr:rate:{scope}:account:{self._opaque(identity)}")
        for key in keys:
            count, ttl = await self._increment(key, limit.window_seconds)
            if count > limit.requests:
                raise HTTPException(
                    status_code=429,
                    detail={"success": False, "error": "Too many requests. Please wait before trying again."},
                    headers={"Retry-After": str(max(1, ttl))},
                )

    async def _increment(self, key: str, window_seconds: int) -> tuple[int, int]:
        settings = get_settings()
        if not settings.rate_limit_redis_url and settings.is_production:
            api_error("This request cannot be processed safely right now. Please try again shortly.", 503)
        if settings.rate_limit_redis_url:
            try:
                if self._client is None:
                    from redis.asyncio import Redis
                    self._client = Redis.from_url(settings.rate_limit_redis_url, decode_responses=True)
                async with self._client.pipeline(transaction=True) as pipeline:
                    pipeline.incr(key)
                    pipeline.ttl(key)
                    count, ttl = await pipeline.execute()
                if int(count) == 1 or int(ttl) < 0:
                    await self._client.expire(key, window_seconds)
                    ttl = window_seconds
                return int(count), int(ttl)
            except Exception:
                if settings.is_production:
                    api_error("This request cannot be processed safely right now. Please try again shortly.", 503)
        now = time.monotonic()
        count, expires = self._memory.get(key, (0, now + window_seconds))
        if now >= expires:
            count, expires = 0, now + window_seconds
        count += 1
        self._memory[key] = (count, expires)
        return count, max(1, int(expires - now))


rate_limit_service = RateLimitService()
