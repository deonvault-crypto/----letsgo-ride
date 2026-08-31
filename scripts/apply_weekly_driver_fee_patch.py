from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"expected text not found in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


# Configurable two-day grace period after the Day-7 statement.
replace_once(
    "backend/app/config.py",
    '        self.payout_data_encryption_key = self._get_env_first("PAYOUT_DATA_ENCRYPTION_KEY")\n',
    '        self.payout_data_encryption_key = self._get_env_first("PAYOUT_DATA_ENCRYPTION_KEY")\n'
    '        self.driver_fee_grace_days = max(1, int(os.getenv("DRIVER_FEE_GRACE_DAYS", "2")))\n',
)

# Driver wallet: overlay the new postpaid settlement truth on the existing bounded ledger.
replace_once(
    "backend/app/services/worker_wallet_service.py",
    'async def wallet_summary(user: Dict[str, Any]) -> Dict[str, Any]:\n    role = str(user.get("role") or "").strip().lower()\n    if role == "driver":\n        return await _driver_wallet(user)\n    # Courier economics are a separate product contract. Preserve them until that\n    # contract is intentionally changed rather than silently applying driver rules.\n    return await legacy_wallet_summary(user)\n',
    'async def wallet_summary(user: Dict[str, Any]) -> Dict[str, Any]:\n'
    '    role = str(user.get("role") or "").strip().lower()\n'
    '    if role == "driver":\n'
    '        from app.services.driver_fee_settlement_service import driver_settlement_wallet\n'
    '        base = await _driver_wallet(user)\n'
    '        settlement = await driver_settlement_wallet(str(user["id"]))\n'
    '        current_week = settlement.get("current_week") or {}\n'
    '        weekly_fee = _money(current_week.get("platform_fee_accrued_usd"))\n'
    '        return {\n'
    '            **base,\n'
    '            **settlement,\n'
    '            "platform_commission_usd": weekly_fee,\n'
    '            "amount_due_to_platform_usd": _money(settlement.get("amount_due_to_platform_usd")),\n'
    '            "settlement_integrated": bool(settlement.get("settlement_payment_enabled")),\n'
    '            "cash_policy": "passenger_pays_driver_directly",\n'
    '            "platform_fee_policy": "weekly_postpaid",\n'
    '        }\n'
    '    # Courier economics are a separate product contract. Preserve them until that\n'
    '    # contract is intentionally changed rather than silently applying driver rules.\n'
    '    return await legacy_wallet_summary(user)\n',
)

# Daily driver stats should show the fee accrued on direct/cash rides rather than pretending cash has no fee.
replace_once(
    "backend/app/services/driver_hailing_finance_service.py",
    '    if payment_method == "cash":\n        return {"gross": gross, "commission": 0.0, "earnings": gross}\n',
    '    if payment_method in {"cash", "direct"}:\n'
    '        commission = min(gross, _money(fare.get("platform_commission")))\n'
    '        return {"gross": gross, "commission": commission, "earnings": _money(max(0.0, gross - commission))}\n',
)
replace_once(
    "backend/app/services/driver_hailing_finance_service.py",
    '                "cash_earnings": {\n                    "$sum": {\n                        "$cond": [\n                            {"$eq": ["$payment_method", "cash"]},\n                            "$gross",\n                            0,\n                        ]\n                    }\n                },\n',
    '                "cash_earnings": {\n'
    '                    "$sum": {"$cond": [{"$in": ["$payment_method", ["cash", "direct"]]}, "$gross", 0]}\n'
    '                },\n'
    '                "cash_commission": {\n'
    '                    "$sum": {"$cond": [{"$in": ["$payment_method", ["cash", "direct"]]}, "$quoted_commission", 0]}\n'
    '                },\n',
)
replace_once(
    "backend/app/services/driver_hailing_finance_service.py",
    '    commission = _money(min(settled_card_gross, _money(row.get("settled_card_commission"))))\n    card_earnings = _money(max(0.0, settled_card_gross - commission))\n',
    '    cash_commission = _money(min(cash_earnings, _money(row.get("cash_commission"))))\n'
    '    card_commission = _money(min(settled_card_gross, _money(row.get("settled_card_commission"))))\n'
    '    commission = _money(cash_commission + card_commission)\n'
    '    cash_earnings = _money(max(0.0, cash_earnings - cash_commission))\n'
    '    card_earnings = _money(max(0.0, settled_card_gross - card_commission))\n',
)

# Financial overdue only pauses Ride Now eligibility; it never disables the user's account.
replace_once(
    "backend/app/services/hailing_trip_service.py",
    'from app.services.notification_service import create_app_notification, notify_admins\n',
    'from app.services.notification_service import create_app_notification, notify_admins\n'
    'from app.services.driver_fee_settlement_service import assert_driver_settlement_clear\n',
)
replace_once(
    "backend/app/services/hailing_trip_service.py",
    '    driver = await approved_driver_for_hailing(user, payload["city_id"], payload["ride_class"])\n',
    '    await assert_driver_settlement_clear(str(user["id"]))\n'
    '    driver = await approved_driver_for_hailing(user, payload["city_id"], payload["ride_class"])\n',
)
replace_once(
    "backend/app/services/hailing_trip_service.py",
    '    driver = await driver_profile_for_user(user)\n    active = await active_trip_for_user(user)\n    if active:\n        raise ValueError("Complete your active Ride Now trip before accepting another ride.")\n',
    '    driver = await driver_profile_for_user(user)\n'
    '    await assert_driver_settlement_clear(str(user["id"]))\n'
    '    active = await active_trip_for_user(user)\n'
    '    if active:\n'
    '        raise ValueError("Complete your active Ride Now trip before accepting another ride.")\n',
)

# Start the low-frequency statement/reminder sweeper alongside Ride Now.
replace_once(
    "backend/app/main.py",
    'from app.services.worker_finance_index_service import ensure_worker_finance_indexes\n',
    'from app.services.worker_finance_index_service import ensure_worker_finance_indexes\n'
    'from app.services.driver_fee_settlement_service import driver_fee_settlement_sweeper\n',
)
replace_once(
    "backend/app/main.py",
    'stripe_payment_task: asyncio.Task | None = None\n',
    'stripe_payment_task: asyncio.Task | None = None\n'
    'driver_fee_settlement_stop_event: asyncio.Event | None = None\n'
    'driver_fee_settlement_task: asyncio.Task | None = None\n',
)
replace_once(
    "backend/app/main.py",
    '    global ride_lifecycle_stop_event, ride_lifecycle_task, hailing_dispatch_stop_event, hailing_dispatch_task, stripe_payment_stop_event, stripe_payment_task, staging_routing_smoke_task, staging_courier_dispatch_smoke_task\n',
    '    global ride_lifecycle_stop_event, ride_lifecycle_task, hailing_dispatch_stop_event, hailing_dispatch_task, stripe_payment_stop_event, stripe_payment_task, driver_fee_settlement_stop_event, driver_fee_settlement_task, staging_routing_smoke_task, staging_courier_dispatch_smoke_task\n',
)
replace_once(
    "backend/app/main.py",
    '        hailing_dispatch_task = asyncio.create_task(hailing_dispatch_sweeper(hailing_dispatch_stop_event))\n        logger.info("hailing_runtime enabled=true bounded_dispatch=true")\n',
    '        hailing_dispatch_task = asyncio.create_task(hailing_dispatch_sweeper(hailing_dispatch_stop_event))\n'
    '        driver_fee_settlement_stop_event = asyncio.Event()\n'
    '        driver_fee_settlement_task = asyncio.create_task(driver_fee_settlement_sweeper(driver_fee_settlement_stop_event))\n'
    '        logger.info("hailing_runtime enabled=true bounded_dispatch=true weekly_driver_settlement=true")\n',
)
replace_once(
    "backend/app/main.py",
    '        hailing_dispatch_stop_event = None\n        hailing_dispatch_task = None\n        logger.info("hailing_runtime enabled=false dispatch_sweeper_started=false")\n',
    '        hailing_dispatch_stop_event = None\n'
    '        hailing_dispatch_task = None\n'
    '        driver_fee_settlement_stop_event = None\n'
    '        driver_fee_settlement_task = None\n'
    '        logger.info("hailing_runtime enabled=false dispatch_sweeper_started=false")\n',
)
# second matching global is shutdown
replace_once(
    "backend/app/main.py",
    '    global ride_lifecycle_stop_event, ride_lifecycle_task, hailing_dispatch_stop_event, hailing_dispatch_task, stripe_payment_stop_event, stripe_payment_task, staging_routing_smoke_task, staging_courier_dispatch_smoke_task\n',
    '    global ride_lifecycle_stop_event, ride_lifecycle_task, hailing_dispatch_stop_event, hailing_dispatch_task, stripe_payment_stop_event, stripe_payment_task, driver_fee_settlement_stop_event, driver_fee_settlement_task, staging_routing_smoke_task, staging_courier_dispatch_smoke_task\n',
)
replace_once(
    "backend/app/main.py",
    '    if stripe_payment_task:\n        stripe_payment_task.cancel()\n',
    '    if stripe_payment_task:\n'
    '        stripe_payment_task.cancel()\n'
    '    if driver_fee_settlement_stop_event:\n'
    '        driver_fee_settlement_stop_event.set()\n'
    '    if driver_fee_settlement_task:\n'
    '        driver_fee_settlement_task.cancel()\n',
)

# Driver Wallet becomes the weekly postpaid settlement surface; Courier retains payout methods.
replace_once(
    "mobile/app/(shared)/wallet.tsx",
    'import { PayoutMethodType, WorkerPayoutMethod, WorkerWallet } from "../../types/workerFinance.types";\n',
    'import { PayoutMethodType, WorkerPayoutMethod, WorkerWallet } from "../../types/workerFinance.types";\n'
    'import { DriverSettlementWallet } from "../../components/finance/DriverSettlementWallet";\n',
)
replace_once(
    "mobile/app/(shared)/wallet.tsx",
    '  const roleLabel = wallet?.worker_role === "courier" ? "Courier" : "Driver";\n  return (\n',
    '  const roleLabel = wallet?.worker_role === "courier" ? "Courier" : "Driver";\n'
    '  if (wallet?.worker_role === "driver") {\n'
    '    return <DriverSettlementWallet wallet={wallet} refreshing={refreshing} onRefresh={refresh} onReload={load} />;\n'
    '  }\n'
    '  return (\n',
)

print("weekly driver fee patch applied")
