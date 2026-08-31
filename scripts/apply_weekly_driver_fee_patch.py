from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"expected text not found in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


# The new durable statement collection must exist in the in-memory test/development backend too.
replace_once(
    "backend/app/database.py",
    '    "hailing_trip_events",\n]',
    '    "hailing_trip_events",\n    "driver_fee_statements",\n]',
)

# Configurable two-day grace period after the Day-7 statement.
replace_once(
    "backend/app/config.py",
    '        self.payout_data_encryption_key = self._get_env_first("PAYOUT_DATA_ENCRYPTION_KEY")\n',
    '        self.payout_data_encryption_key = self._get_env_first("PAYOUT_DATA_ENCRYPTION_KEY")\n'
    '        self.driver_fee_grace_days = max(1, int(os.getenv("DRIVER_FEE_GRACE_DAYS", "2")))\n',
)

# Driver trip ledger: passenger pays the gross cash fare directly, while the immutable
# fare snapshot records the LetsGoRide fee that becomes payable only in the weekly statement.
replace_once(
    "backend/app/services/worker_wallet_service.py",
    '    """Apply the LetsGoRide launch economics to an immutable trip fare snapshot.\n\n'
    '    Cash is collected directly by the driver and belongs to the driver in full.\n'
    '    LetsGoRide only recognizes its configured platform percentage on settled card\n'
    '    payments. The fare snapshot remains the source of truth for historical card\n'
    '    economics so later pricing changes cannot rewrite completed-trip accounting.\n'
    '    """\n',
    '    """Apply immutable trip economics without confusing cash custody with net earnings.\n\n'
    '    Passenger cash/direct payment is physically collected by the driver immediately.\n'
    '    The configured fare snapshot still records LetsGoRide\'s service fee, which is not\n'
    '    due until the weekly postpaid statement is issued. Historical settled card rides\n'
    '    remain readable for backwards-compatible accounting but are not part of new statements.\n'
    '    """\n',
)
replace_once(
    "backend/app/services/worker_wallet_service.py",
    '    if payment_method == "cash":\n'
    '        return {\n'
    '            "gross": gross,\n'
    '            "commission": 0.0,\n'
    '            "worker_earnings": gross,\n'
    '            "payment_method": "cash",\n'
    '            "settlement_state": "cash_kept_by_driver",\n'
    '            "recognized": True,\n'
    '        }\n\n'
    '    quoted_commission = min(gross, _money(fare.get("platform_commission")))\n',
    '    quoted_commission = min(gross, _money(fare.get("platform_commission")))\n'
    '    if payment_method in {"cash", "direct"}:\n'
    '        return {\n'
    '            "gross": gross,\n'
    '            "commission": quoted_commission,\n'
    '            "worker_earnings": _money(max(0.0, gross - quoted_commission)),\n'
    '            "payment_method": payment_method,\n'
    '            "settlement_state": "weekly_fee_accruing",\n'
    '            "recognized": True,\n'
    '        }\n\n',
)
replace_once(
    "backend/app/services/worker_wallet_service.py",
    '            if finance["payment_method"] == "cash":\n'
    '                cash += finance["gross"]\n'
    '                net += finance["worker_earnings"]\n'
    '            elif finance["recognized"]:\n',
    '            if finance["payment_method"] in {"cash", "direct"}:\n'
    '                cash += finance["gross"]\n'
    '                commission += finance["commission"]\n'
    '                net += finance["worker_earnings"]\n'
    '            elif finance["recognized"]:\n',
)
replace_once(
    "backend/app/services/worker_wallet_service.py",
    '                "cash": {\n'
    '                    "$sum": {"$cond": [{"$eq": ["$payment_method", "cash"]}, "$gross", 0]}\n'
    '                },\n',
    '                "cash": {\n'
    '                    "$sum": {"$cond": [{"$in": ["$payment_method", ["cash", "direct"]]}, "$gross", 0]}\n'
    '                },\n'
    '                "cash_commission": {\n'
    '                    "$sum": {"$cond": [{"$in": ["$payment_method", ["cash", "direct"]]}, "$quoted_commission", 0]}\n'
    '                },\n',
)
replace_once(
    "backend/app/services/worker_wallet_service.py",
    '                                    {"$ne": ["$payment_method", "cash"]},\n',
    '                                    {"$not": [{"$in": ["$payment_method", ["cash", "direct"]]}]},\n',
)
replace_once(
    "backend/app/services/worker_wallet_service.py",
    '                                    {"$ne": ["$payment_method", "cash"]},\n',
    '                                    {"$not": [{"$in": ["$payment_method", ["cash", "direct"]]}]},\n',
)
replace_once(
    "backend/app/services/worker_wallet_service.py",
    '    commission = _money(min(card_gross, _money(row.get("settled_card_commission"))))\n'
    '    digital = _money(max(0.0, card_gross - commission))\n'
    '    return {\n'
    '        "gross": gross,\n'
    '        "net": _money(cash + digital),\n'
    '        "cash": cash,\n'
    '        "digital": digital,\n'
    '        "commission": commission,\n'
    '    }\n',
    '    cash_commission = _money(min(cash, _money(row.get("cash_commission"))))\n'
    '    card_commission = _money(min(card_gross, _money(row.get("settled_card_commission"))))\n'
    '    commission = _money(cash_commission + card_commission)\n'
    '    digital = _money(max(0.0, card_gross - card_commission))\n'
    '    return {\n'
    '        "gross": gross,\n'
    '        "net": _money(max(0.0, cash - cash_commission) + digital),\n'
    '        "cash": cash,\n'
    '        "digital": digital,\n'
    '        "commission": commission,\n'
    '    }\n',
)
replace_once(
    "backend/app/services/worker_wallet_service.py",
    '                "platform_commission_usd": finance["commission"] if finance["payment_method"] != "cash" else 0.0,\n',
    '                "platform_commission_usd": finance["commission"],\n',
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
    '  if (wallet?.worker_role === "driver") {\n'
    '    return <DriverSettlementWallet wallet={wallet} refreshing={refreshing} onRefresh={refresh} onReload={load} />;\n'
    '  }\n'
    '  const roleLabel = "Courier";\n'
    '  return (\n',
)
replace_once(
    "mobile/app/(shared)/wallet.tsx",
    '        {wallet.worker_role === "driver" ? (\n'
    '          <View style={styles.driverPolicyCard}>\n'
    '            <View style={styles.driverPolicyIcon}><MaterialCommunityIcons name="cash-check" size={22} color="#111111" /></View>\n'
    '            <View style={styles.driverPolicyCopy}>\n'
    '              <Text style={styles.driverPolicyTitle}>Cash fares are 100% yours</Text>\n'
    '              <Text style={styles.driverPolicyBody}>When a passenger pays cash, you keep the full fare. LetsGoRide only takes its platform fee from successfully settled card rides.</Text>\n'
    '            </View>\n'
    '          </View>\n'
    '        ) : null}\n\n',
    '',
)
replace_once(
    "mobile/app/(shared)/wallet.tsx",
    '          <MoneyCard icon="cash-multiple" label={wallet.worker_role === "driver" ? "Cash kept by you" : "Cash collected"} value={money(wallet.cash_collected_usd)} body={wallet.worker_role === "driver" ? "Full cash fare kept directly by the driver." : "Cash collected directly on completed work."} />\n',
    '          <MoneyCard icon="cash-multiple" label="Cash collected" value={money(wallet.cash_collected_usd)} body="Cash collected directly on completed work." />\n',
)
replace_once(
    "mobile/app/(shared)/wallet.tsx",
    '          <MoneyCard icon="percent-outline" label={wallet.worker_role === "driver" ? "Card platform fee" : "Platform commission"} value={money(wallet.platform_commission_usd)} body={wallet.worker_role === "driver" ? "LetsGoRide fee from settled card rides only." : "Platform commission recorded across completed work."} />\n',
    '          <MoneyCard icon="percent-outline" label="Platform commission" value={money(wallet.platform_commission_usd)} body="Platform commission recorded across completed work." />\n',
)
replace_once(
    "mobile/components/finance/DriverSettlementWallet.tsx",
    '  historyTitle: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "850" },\n',
    '  historyTitle: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "800" },\n',
)

# Retire regression assertions for the explicitly superseded card-only/cash-free policy.
replace_once(
    "backend/tests/test_driver_cash_card_finance.py",
    '        for collection in ("drivers", "hailing_trips", "worker_payout_methods", "worker_payouts"):\n',
    '        for collection in ("drivers", "hailing_trips", "worker_payout_methods", "worker_payouts", "driver_fee_statements"):\n',
)
replace_once(
    "backend/tests/test_driver_cash_card_finance.py",
    '    def test_cash_trip_never_creates_platform_commission(self):\n',
    '    def test_cash_trip_records_weekly_postpaid_platform_fee(self):\n',
)
replace_once(
    "backend/tests/test_driver_cash_card_finance.py",
    '        self.assertEqual(finance["commission"], 0.0)\n        self.assertEqual(finance["worker_earnings"], 7.50)\n        self.assertEqual(finance["settlement_state"], "cash_kept_by_driver")\n',
    '        self.assertEqual(finance["commission"], 0.23)\n'
    '        self.assertEqual(finance["worker_earnings"], 7.27)\n'
    '        self.assertEqual(finance["settlement_state"], "weekly_fee_accruing")\n',
)
replace_once(
    "backend/tests/test_driver_cash_card_finance.py",
    '    async def test_wallet_keeps_all_cash_and_only_charges_settled_card(self):\n',
    '    async def test_wallet_tracks_direct_cash_and_weekly_postpaid_fee(self):\n',
)
replace_once(
    "backend/tests/test_driver_cash_card_finance.py",
    '        self.assertEqual(wallet["net_earnings_usd"], 19.70)\n'
    '        self.assertEqual(wallet["cash_policy"], "driver_keeps_100_percent")\n'
    '        self.assertEqual(wallet["platform_fee_policy"], "card_only")\n\n'
    '        cash_entry = next(entry for entry in wallet["ledger"] if entry["source_id"] == "cash-trip")\n'
    '        pending_entry = next(entry for entry in wallet["ledger"] if entry["source_id"] == "card-pending")\n'
    '        self.assertEqual(cash_entry["platform_commission_usd"], 0.0)\n'
    '        self.assertEqual(cash_entry["worker_earnings_usd"], 10.00)\n',
    '        self.assertEqual(wallet["net_earnings_usd"], 19.40)\n'
    '        self.assertEqual(wallet["cash_policy"], "passenger_pays_driver_directly")\n'
    '        self.assertEqual(wallet["platform_fee_policy"], "weekly_postpaid")\n'
    '        self.assertEqual(wallet["settlement_required"], False)\n\n'
    '        cash_entry = next(entry for entry in wallet["ledger"] if entry["source_id"] == "cash-trip")\n'
    '        pending_entry = next(entry for entry in wallet["ledger"] if entry["source_id"] == "card-pending")\n'
    '        self.assertEqual(cash_entry["platform_commission_usd"], 0.30)\n'
    '        self.assertEqual(cash_entry["worker_earnings_usd"], 9.70)\n'
    '        self.assertEqual(cash_entry["settlement_state"], "weekly_fee_accruing")\n',
)
replace_once(
    "backend/tests/test_driver_hailing_finance.py",
    '    async def test_cash_is_full_driver_earnings_and_only_settled_card_pays_platform_fee(self):\n',
    '    async def test_direct_cash_accrues_weekly_fee_and_settled_legacy_card_is_accounted(self):\n',
)
replace_once(
    "backend/tests/test_driver_hailing_finance.py",
    '        self.assertEqual(stats["today_platform_commission"], 0.30)\n        self.assertEqual(stats["today_estimated_earnings"], 19.70)\n',
    '        self.assertEqual(stats["today_platform_commission"], 0.60)\n'
    '        self.assertEqual(stats["today_estimated_earnings"], 19.40)\n',
)

print("weekly driver fee patch applied")
