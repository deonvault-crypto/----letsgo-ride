from __future__ import annotations

from pathlib import Path

path = Path(__file__).resolve().parents[1] / "backend/tests/test_stripe_hailing_payments.py"
text = path.read_text(encoding="utf-8")
anchor = "    stripe_enabled=True,\n"
addition = "    stripe_enabled=True,\n    passenger_card_payments_enabled=True,\n"
if "    passenger_card_payments_enabled=True,\n" not in text:
    if anchor not in text:
        raise RuntimeError("Stripe test settings anchor missing")
    text = text.replace(anchor, addition, 1)
    path.write_text(text, encoding="utf-8")
print("Stripe hailing test rollout flag aligned")
