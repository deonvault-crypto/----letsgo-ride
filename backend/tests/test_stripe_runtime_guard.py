from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
import requests

from app.services import stripe_runtime_guard


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def json(self):
        return self._payload


def settings(**overrides):
    values = {
        "stripe_configured": True,
        "is_production": True,
        "stripe_account_id": "acct_1TbpjQ3sHZt9Hi95",
        "stripe_currency": "usd",
        "stripe_secret_key": "sk_live_redacted",
        "stripe_timeout_seconds": 3,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_production_rejects_non_usd_currency():
    with pytest.raises(stripe_runtime_guard.StripeAccountConfigurationError, match="currency must be USD"):
        stripe_runtime_guard._validate_local_config(settings(stripe_currency="eur"))


def test_production_requires_pinned_stripe_account():
    with pytest.raises(stripe_runtime_guard.StripeAccountConfigurationError, match="account identity"):
        stripe_runtime_guard._validate_local_config(settings(stripe_account_id=""))


def test_runtime_guard_rejects_wrong_live_account(monkeypatch):
    stripe_runtime_guard.reset_stripe_runtime_guard_for_tests()
    monkeypatch.setattr(stripe_runtime_guard, "get_settings", lambda: settings())
    monkeypatch.setattr(
        stripe_runtime_guard.requests,
        "get",
        lambda *args, **kwargs: FakeResponse({"id": "acct_wrong", "charges_enabled": True}),
    )
    with pytest.raises(stripe_runtime_guard.StripeAccountConfigurationError, match="does not belong"):
        asyncio.run(stripe_runtime_guard.ensure_stripe_runtime_binding())


def test_runtime_guard_treats_provider_outage_as_temporary(monkeypatch):
    stripe_runtime_guard.reset_stripe_runtime_guard_for_tests()
    monkeypatch.setattr(stripe_runtime_guard, "get_settings", lambda: settings())

    def unavailable(*args, **kwargs):
        raise requests.Timeout("provider unavailable")

    monkeypatch.setattr(stripe_runtime_guard.requests, "get", unavailable)
    with pytest.raises(stripe_runtime_guard.StripeVerificationUnavailable, match="temporarily unavailable"):
        asyncio.run(stripe_runtime_guard.ensure_stripe_runtime_binding())
    assert stripe_runtime_guard.stripe_runtime_ready() is False


def test_runtime_guard_accepts_approved_live_account(monkeypatch):
    stripe_runtime_guard.reset_stripe_runtime_guard_for_tests()
    monkeypatch.setattr(stripe_runtime_guard, "get_settings", lambda: settings())
    monkeypatch.setattr(
        stripe_runtime_guard.requests,
        "get",
        lambda *args, **kwargs: FakeResponse({"id": "acct_1TbpjQ3sHZt9Hi95", "charges_enabled": True}),
    )
    assert asyncio.run(stripe_runtime_guard.ensure_stripe_runtime_binding()) == "acct_1TbpjQ3sHZt9Hi95"
    assert stripe_runtime_guard.stripe_runtime_ready() is True
