from __future__ import annotations

import json
from typing import Any, Dict, List

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings
from app.database import database
from app.utils import new_id, now_iso


WORKER_ROLES = {"driver", "courier"}


def _worker_role(user: Dict[str, Any]) -> str:
    role = str(user.get("role") or "").lower()
    if role not in WORKER_ROLES:
        raise PermissionError("A Driver or Courier account is required.")
    return role


def _cipher() -> Fernet:
    key = get_settings().payout_data_encryption_key
    if not key:
        raise RuntimeError("Payout data encryption is not configured.")
    try:
        return Fernet(key.encode("utf-8"))
    except (TypeError, ValueError) as exc:
        raise RuntimeError("Payout data encryption is misconfigured.") from exc


def _encrypt_payload(payload: Dict[str, Any]) -> str:
    raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return _cipher().encrypt(raw).decode("utf-8")


def _decrypt_payload(token: str) -> Dict[str, Any]:
    try:
        raw = _cipher().decrypt(token.encode("utf-8"))
        decoded = json.loads(raw.decode("utf-8"))
    except (InvalidToken, UnicodeDecodeError, json.JSONDecodeError, AttributeError) as exc:
        raise RuntimeError("Saved payout data could not be decrypted.") from exc
    if not isinstance(decoded, dict):
        raise RuntimeError("Saved payout data is invalid.")
    return decoded


def _last_digits(value: Any, count: int = 4) -> str:
    compact = "".join(character for character in str(value or "") if character.isalnum())
    return compact[-count:] if compact else ""


def _masked_reference(payload: Dict[str, Any]) -> str:
    method_type = payload["method_type"]
    raw = payload.get("mobile_number") if method_type == "ECOCASH" else payload.get("account_number")
    suffix = _last_digits(raw)
    return f"•••• {suffix}" if suffix else "Saved securely"


def _public_method(row: Dict[str, Any]) -> Dict[str, Any]:
    payload = _decrypt_payload(str(row.get("encrypted_payload") or ""))
    is_bank = payload.get("method_type") == "BANK"
    return {
        "id": row.get("id"),
        "method_type": payload.get("method_type"),
        "account_holder_name": payload.get("account_holder_name"),
        "bank_name": payload.get("bank_name") if is_bank else None,
        "branch_name": payload.get("branch_name") if is_bank else None,
        "branch_code": payload.get("branch_code") if is_bank else None,
        "currency": payload.get("currency") or "USD",
        "masked_reference": row.get("masked_reference") or _masked_reference(payload),
        "is_default": bool(row.get("is_default")),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def _normalized_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    method_type = str(payload["method_type"]).upper()
    result = {
        "method_type": method_type,
        "account_holder_name": str(payload["account_holder_name"]).strip(),
        "currency": str(payload.get("currency") or "USD").upper(),
    }
    if method_type == "ECOCASH":
        result["mobile_number"] = str(payload["mobile_number"]).strip()
    else:
        result.update(
            {
                "bank_name": str(payload["bank_name"]).strip(),
                "account_number": str(payload["account_number"]).strip(),
                "branch_name": payload.get("branch_name"),
                "branch_code": payload.get("branch_code"),
            }
        )
    return result


def _merged_update_payload(existing_payload: Dict[str, Any], updates: Dict[str, Any]) -> Dict[str, Any]:
    """Merge a partial edit without ever substituting masked display data for secrets."""

    merged = dict(existing_payload)
    method_type = str(existing_payload.get("method_type") or "").upper()
    if method_type not in {"ECOCASH", "BANK"}:
        raise RuntimeError("Saved payout data is invalid.")

    bank_fields = {"bank_name", "account_number", "branch_name", "branch_code"}
    if method_type == "ECOCASH" and bank_fields.intersection(updates):
        raise ValueError("Bank fields cannot be edited on an EcoCash payout method.")
    if method_type == "BANK" and "mobile_number" in updates:
        raise ValueError("An EcoCash mobile number cannot be edited on a bank payout method.")

    required_fields = {"account_holder_name", "currency"}
    required_fields.add("mobile_number" if method_type == "ECOCASH" else "bank_name")
    if method_type == "BANK":
        required_fields.add("account_number")
    for field in required_fields:
        if field in updates and updates[field] is None:
            raise ValueError(f"{field.replace('_', ' ').title()} cannot be cleared.")

    for field in ("account_holder_name", "currency", "mobile_number", "bank_name", "account_number", "branch_name", "branch_code"):
        if field in updates:
            merged[field] = updates[field]
    return _normalized_payload(merged)


async def list_payout_methods(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    role = _worker_role(user)
    rows = await database.find_many(
        "worker_payout_methods",
        {"user_id": user["id"], "worker_role": role, "status": "active"},
    )
    rows.sort(key=lambda item: (not bool(item.get("is_default")), str(item.get("created_at") or "")))
    return [_public_method(row) for row in rows]


async def create_payout_method(payload: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    role = _worker_role(user)
    clean = _normalized_payload(payload)
    existing = await database.find_many(
        "worker_payout_methods",
        {"user_id": user["id"], "worker_role": role, "status": "active"},
    )
    make_default = bool(payload.get("make_default")) or not existing
    timestamp = now_iso()
    row = {
        "id": new_id(),
        "user_id": user["id"],
        "worker_role": role,
        "method_type": clean["method_type"],
        "encrypted_payload": _encrypt_payload(clean),
        "masked_reference": _masked_reference(clean),
        "is_default": make_default,
        "status": "active",
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    if make_default:
        await database.update_many(
            "worker_payout_methods",
            {"user_id": user["id"], "worker_role": role, "status": "active"},
            {"is_default": False, "updated_at": timestamp},
        )
    created = await database.insert_one("worker_payout_methods", row)
    return _public_method(created)


async def update_payout_method(method_id: str, payload: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    role = _worker_role(user)
    existing = await database.find_one(
        "worker_payout_methods",
        {"id": method_id, "user_id": user["id"], "worker_role": role, "status": "active"},
    )
    if not existing:
        raise ValueError("Payout method not found.")

    existing_payload = _decrypt_payload(str(existing.get("encrypted_payload") or ""))
    clean = _merged_update_payload(existing_payload, payload)
    timestamp = now_iso()
    make_default = bool(payload.get("make_default"))
    if make_default:
        await database.update_many(
            "worker_payout_methods",
            {"user_id": user["id"], "worker_role": role, "status": "active"},
            {"is_default": False, "updated_at": timestamp},
        )
    updated = await database.update_one(
        "worker_payout_methods",
        method_id,
        {
            "method_type": clean["method_type"],
            "encrypted_payload": _encrypt_payload(clean),
            "masked_reference": _masked_reference(clean),
            "is_default": True if make_default else bool(existing.get("is_default")),
            "updated_at": timestamp,
        },
    )
    if not updated:
        raise ValueError("Payout method not found.")
    return _public_method(updated)


async def set_default_payout_method(method_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    role = _worker_role(user)
    method = await database.find_one(
        "worker_payout_methods",
        {"id": method_id, "user_id": user["id"], "worker_role": role, "status": "active"},
    )
    if not method:
        raise ValueError("Payout method not found.")
    timestamp = now_iso()
    await database.update_many(
        "worker_payout_methods",
        {"user_id": user["id"], "worker_role": role, "status": "active"},
        {"is_default": False, "updated_at": timestamp},
    )
    updated = await database.update_one("worker_payout_methods", method_id, {"is_default": True, "updated_at": timestamp})
    return _public_method(updated or method)


async def delete_payout_method(method_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    role = _worker_role(user)
    method = await database.find_one(
        "worker_payout_methods",
        {"id": method_id, "user_id": user["id"], "worker_role": role, "status": "active"},
    )
    if not method:
        raise ValueError("Payout method not found.")
    timestamp = now_iso()
    await database.update_one(
        "worker_payout_methods",
        method_id,
        {"status": "deleted", "is_default": False, "deleted_at": timestamp, "updated_at": timestamp},
    )
    if method.get("is_default"):
        remaining = await database.find_many(
            "worker_payout_methods",
            {"user_id": user["id"], "worker_role": role, "status": "active"},
        )
        if remaining:
            replacement = sorted(remaining, key=lambda item: str(item.get("created_at") or ""))[0]
            await database.update_one("worker_payout_methods", replacement["id"], {"is_default": True, "updated_at": timestamp})
    return {"deleted": True, "id": method_id}


def _money(value: Any) -> float:
    try:
        return round(float(value or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def _driver_trip_financials(trip: Dict[str, Any]) -> Dict[str, Any]:
    """Apply LetsGoRide's worker settlement policy to a completed Ride Now trip.

    Cash is collected directly by the driver and belongs to the driver in full.
    LetsGoRide commission is charged only on card-paid Ride Now trips. Historical
    cash trips may still contain a quoted platform_commission in their fare snapshot;
    that quoted value is intentionally ignored here so it can never become driver debt.
    """

    fare = trip.get("fare") or {}
    gross = _money(fare.get("total_fare"))
    payment_method = "card" if str(trip.get("payment_method") or "cash").lower() == "card" else "cash"

    if payment_method == "card":
        commission = min(gross, max(0.0, _money(fare.get("platform_commission"))))
        worker_earnings = round(max(0.0, gross - commission), 2)
        return {
            "payment_method": payment_method,
            "gross_usd": gross,
            "platform_commission_usd": commission,
            "worker_earnings_usd": worker_earnings,
            "cash_collected_usd": 0.0,
            "digital_earnings_usd": worker_earnings,
            "settlement_state": "accrued",
        }

    return {
        "payment_method": "cash",
        "gross_usd": gross,
        "platform_commission_usd": 0.0,
        "worker_earnings_usd": gross,
        "cash_collected_usd": gross,
        "digital_earnings_usd": 0.0,
        "settlement_state": "cash_collected_by_driver",
    }


async def _driver_wallet(user: Dict[str, Any]) -> Dict[str, Any]:
    driver = await database.find_one("drivers", {"user_id": user["id"]})
    if not driver:
        raise PermissionError("Complete your Driver profile before opening the wallet.")
    trips = await database.find_many("hailing_trips", {"driver_user_id": user["id"], "status": "COMPLETED"})
    entries = []
    gross = commission = net = cash_collected = digital_earnings = 0.0
    for trip in trips:
        settlement = _driver_trip_financials(trip)
        trip_gross = settlement["gross_usd"]
        trip_commission = settlement["platform_commission_usd"]
        trip_net = settlement["worker_earnings_usd"]
        gross += trip_gross
        commission += trip_commission
        net += trip_net
        cash_collected += settlement["cash_collected_usd"]
        digital_earnings += settlement["digital_earnings_usd"]
        entries.append(
            {
                "id": f"hailing:{trip['id']}",
                "source_type": "RIDE_NOW",
                "source_id": trip["id"],
                "label": f"Ride Now · {(trip.get('dropoff') or {}).get('formatted_address') or 'completed trip'}",
                "gross_usd": trip_gross,
                "platform_commission_usd": trip_commission,
                "worker_earnings_usd": trip_net,
                "payment_method": settlement["payment_method"],
                "settlement_state": settlement["settlement_state"],
                "occurred_at": trip.get("completed_at") or trip.get("updated_at"),
            }
        )
    payouts = await database.find_many("worker_payouts", {"user_id": user["id"], "worker_role": "driver", "status": "paid"})
    paid_out = sum(_money(item.get("amount_usd")) for item in payouts)
    available = max(0.0, round(digital_earnings - paid_out, 2))
    entries.sort(key=lambda item: str(item.get("occurred_at") or ""), reverse=True)
    return {
        "currency": "USD",
        "worker_role": "driver",
        "available_balance_usd": available,
        "gross_earnings_usd": round(gross, 2),
        "net_earnings_usd": round(net, 2),
        "cash_collected_usd": round(cash_collected, 2),
        "digital_earnings_usd": round(digital_earnings, 2),
        "amount_due_to_platform_usd": 0.0,
        "platform_commission_usd": round(commission, 2),
        "paid_out_usd": round(paid_out, 2),
        "ledger": entries[:100],
        "payout_history": sorted(payouts, key=lambda item: str(item.get("created_at") or ""), reverse=True)[:50],
        "settlement_integrated": False,
    }


async def _courier_wallet(user: Dict[str, Any]) -> Dict[str, Any]:
    deliveries = await database.find_many("courier_deliveries", {"courier_user_id": user["id"], "status": "DELIVERED"})
    entries = []
    accrued = 0.0
    for delivery in deliveries:
        payout = _money(delivery.get("courier_payout_usd"))
        accrued += payout
        entries.append(
            {
                "id": f"courier:{delivery['id']}",
                "source_type": "FOOD_DELIVERY" if delivery.get("source_type") == "FOOD_ORDER" else "COURIER_DELIVERY",
                "source_id": delivery["id"],
                "label": f"Delivery · {delivery.get('dropoff_address') or 'completed job'}",
                "gross_usd": _money(delivery.get("price_usd")),
                "platform_commission_usd": None,
                "worker_earnings_usd": payout,
                "payment_method": None,
                "settlement_state": "accrued",
                "occurred_at": delivery.get("delivered_at") or delivery.get("updated_at"),
            }
        )
    payouts = await database.find_many("worker_payouts", {"user_id": user["id"], "worker_role": "courier", "status": "paid"})
    paid_out = sum(_money(item.get("amount_usd")) for item in payouts)
    available = max(0.0, round(accrued - paid_out, 2))
    entries.sort(key=lambda item: str(item.get("occurred_at") or ""), reverse=True)
    return {
        "currency": "USD",
        "worker_role": "courier",
        "available_balance_usd": available,
        "gross_earnings_usd": round(accrued, 2),
        "net_earnings_usd": round(accrued, 2),
        "cash_collected_usd": 0.0,
        "digital_earnings_usd": round(accrued, 2),
        "amount_due_to_platform_usd": 0.0,
        "platform_commission_usd": 0.0,
        "paid_out_usd": round(paid_out, 2),
        "ledger": entries[:100],
        "payout_history": sorted(payouts, key=lambda item: str(item.get("created_at") or ""), reverse=True)[:50],
        "settlement_integrated": False,
    }


async def wallet_summary(user: Dict[str, Any]) -> Dict[str, Any]:
    role = _worker_role(user)
    summary = await (_driver_wallet(user) if role == "driver" else _courier_wallet(user))
    summary["payout_methods"] = await list_payout_methods(user)
    return summary