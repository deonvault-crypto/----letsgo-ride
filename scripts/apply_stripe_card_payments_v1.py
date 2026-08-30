from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def replace_once(relative: str, old: str, new: str) -> None:
    path = ROOT / relative
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected exactly one match in {relative}, found {count}: {old[:100]!r}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


def write(relative: str, content: str) -> None:
    path = ROOT / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


# ---------------------------------------------------------------------------
# Persistence: payment-intent and webhook idempotency records.
# ---------------------------------------------------------------------------
replace_once(
    "backend/app/database.py",
    '    "hailing_trip_events",\n]',
    '    "hailing_trip_events",\n    "stripe_payment_intents",\n    "stripe_webhook_events",\n]',
)
replace_once(
    "backend/app/database.py",
    '        await self._prepare_unique_user_email_index()\n',
    '''        await self._prepare_unique_user_email_index()\n        await self.db["stripe_payment_intents"].create_index(\n            [("payment_intent_id", 1)],\n            name="stripe_payment_intent_unique",\n            unique=True,\n        )\n        await self.db["stripe_payment_intents"].create_index(\n            [("user_id", 1), ("product", 1), ("quote_id", 1), ("client_request_id", 1)],\n            name="stripe_payment_setup_idempotency",\n            unique=True,\n        )\n        await self.db["stripe_webhook_events"].create_index(\n            [("stripe_event_id", 1)],\n            name="stripe_webhook_event_unique",\n            unique=True,\n        )\n        await self.db["hailing_trips"].create_index(\n            [("payment_intent_id", 1)],\n            name="one_hailing_trip_per_payment_intent",\n            unique=True,\n            partialFilterExpression={"payment_intent_id": {"$type": "string"}},\n        )\n''',
)

# ---------------------------------------------------------------------------
# Public hailing API: advertise Card only when environment-safe Stripe config
# is present, and prepare PaymentSheet server-side from an authoritative quote.
# ---------------------------------------------------------------------------
replace_once(
    "backend/app/routers/hailing.py",
    '    HailingCancelBody,\n',
    '    HailingCancelBody,\n    HailingCardSetupBody,\n',
)
replace_once(
    "backend/app/routers/hailing.py",
    'from app.services.hailing_fare_service import create_quote\n',
    '''from app.services.hailing_fare_service import create_quote\nfrom app.services.stripe_payment_service import (\n    StripePaymentError,\n    prepare_hailing_card_authorization,\n    stripe_card_payments_available,\n)\n''',
)
replace_once(
    "backend/app/routers/hailing.py",
    '        "digital_payments": [],\n',
    '        "digital_payments": ["card"] if stripe_card_payments_available(settings) else [],\n',
)
replace_once(
    "backend/app/routers/hailing.py",
    '\n\n@router.post("/trips")\nasync def create_trip(payload: HailingTripCreateBody, request: Request, user=Depends(get_current_user)):\n',
    '''\n\n@router.post("/payments/card/setup")\nasync def setup_card_payment(payload: HailingCardSetupBody, request: Request, user=Depends(get_current_user)):\n    _require_hailing_enabled()\n    await rate_limit_service.enforce(\n        request,\n        "hailing-card-setup",\n        RateLimit(10, 300),\n        identity=str(user.get("id") or ""),\n    )\n    try:\n        return api_success(\n            await prepare_hailing_card_authorization(\n                payload.quote_id, payload.client_request_id, user\n            )\n        )\n    except StripePaymentError as exc:\n        api_error(str(exc), 503)\n    except ValueError as exc:\n        api_error(str(exc), 400)\n\n\n@router.post("/trips")\nasync def create_trip(payload: HailingTripCreateBody, request: Request, user=Depends(get_current_user)):\n''',
)
replace_once(
    "backend/app/routers/hailing.py",
    '    except PermissionError as exc:\n        api_error(str(exc), 503)\n    except ValueError as exc:\n        api_error(str(exc), 400)\n\n\n@router.get("/trips/active")',
    '    except StripePaymentError as exc:\n        api_error(str(exc), 503)\n    except PermissionError as exc:\n        api_error(str(exc), 503)\n    except ValueError as exc:\n        api_error(str(exc), 400)\n\n\n@router.get("/trips/active")',
)

# ---------------------------------------------------------------------------
# Hailing invariant: a Card trip cannot enter dispatch until Stripe confirms a
# manual-capture authorization for the exact server-side quote. Capture occurs
# after physical trip completion; terminal pre-trip cancellation releases it.
# ---------------------------------------------------------------------------
replace_once(
    "backend/app/services/hailing_trip_service.py",
    '    if not quote or quote_expired(quote):\n        raise ValueError("This Ride Now quote has expired. Please request a new fare.")\n',
    '''    if not quote or quote_expired(quote):\n        raise ValueError("This Ride Now quote has expired. Please request a new fare.")\n    if payload.get("payment_method") == "card":\n        from app.services.stripe_payment_service import validate_hailing_card_authorization\n\n        payment_intent_id = str(payload.get("payment_intent_id") or "")\n        if not payment_intent_id:\n            raise ValueError("Card payment requires a completed card authorization.")\n        await validate_hailing_card_authorization(quote, payment_intent_id, user)\n''',
)
replace_once(
    "backend/app/services/hailing_trip_service.py",
    '        "payment_method": payload["payment_method"],\n        "payment_status": "cash_due" if payload["payment_method"] == "cash" else "pending",\n',
    '        "payment_method": payload["payment_method"],\n        "payment_intent_id": payload.get("payment_intent_id") if payload["payment_method"] == "card" else None,\n        "payment_status": "cash_due" if payload["payment_method"] == "cash" else "authorized",\n',
)
replace_once(
    "backend/app/services/hailing_trip_service.py",
    '    created = await database.insert_one("hailing_trips", trip)\n    logger.info("hailing_request_created trip_id=%s city_id=%s ride_class=%s", created["id"], created["city_id"], created["ride_class"])\n',
    '''    created = await database.insert_one("hailing_trips", trip)\n    if created.get("payment_method") == "card":\n        from app.services.stripe_payment_service import bind_hailing_card_authorization\n\n        created = await bind_hailing_card_authorization(\n            created["id"], str(created.get("payment_intent_id") or "")\n        )\n    logger.info("hailing_request_created trip_id=%s city_id=%s ride_class=%s", created["id"], created["city_id"], created["ride_class"])\n''',
)
replace_once(
    "backend/app/services/hailing_trip_service.py",
    '    await _cancel_pending_dispatch_offers(trip["id"])\n    await create_app_notification(\n        user_id=trip["passenger_user_id"],\n        title="No drivers nearby",\n',
    '''    await _cancel_pending_dispatch_offers(trip["id"])\n    if updated.get("payment_method") == "card":\n        from app.services.stripe_payment_service import release_hailing_card_authorization\n\n        updated = await release_hailing_card_authorization(updated, "no_driver_found")\n    await create_app_notification(\n        user_id=trip["passenger_user_id"],\n        title="No drivers nearby",\n''',
)
replace_once(
    "backend/app/services/hailing_trip_service.py",
    '    updated = await transition_trip(trip, "COMPLETED", {"completed_at": now_iso(), "payment_status": "cash_collected" if trip.get("payment_method") == "cash" else trip.get("payment_status")})\n    if trip.get("driver_id"):\n',
    '''    updated = await transition_trip(trip, "COMPLETED", {"completed_at": now_iso(), "payment_status": "cash_collected" if trip.get("payment_method") == "cash" else trip.get("payment_status")})\n    if updated.get("payment_method") == "card":\n        from app.services.stripe_payment_service import capture_hailing_card_payment\n\n        # Payment failure must never trap a driver on an already-finished physical trip.\n        # Capture failure is recorded for reconciliation while the trip stays COMPLETED.\n        updated = await capture_hailing_card_payment(updated)\n    if trip.get("driver_id"):\n''',
)
replace_once(
    "backend/app/services/hailing_trip_service.py",
    '    if trip.get("driver_id"):\n        await database.update_one(\n            "hailing_driver_presence",\n            f"hailing-presence-{trip[\'driver_id\']}",\n            {"status": "available", "offered_trip_id": None, "offered_at": None, "updated_at": now_iso()},\n        )\n    return public_trip(updated, user)\n\n\nasync def rematch_after_driver_cancellation',
    '''    if trip.get("driver_id"):\n        await database.update_one(\n            "hailing_driver_presence",\n            f"hailing-presence-{trip['driver_id']}",\n            {"status": "available", "offered_trip_id": None, "offered_at": None, "updated_at": now_iso()},\n        )\n    if updated.get("payment_method") == "card":\n        from app.services.stripe_payment_service import release_hailing_card_authorization\n\n        updated = await release_hailing_card_authorization(updated, status.lower())\n    return public_trip(updated, user)\n\n\nasync def rematch_after_driver_cancellation''',
)

# Normalize ownership failures as request validation errors rather than an
# hailing-runtime availability error.
for message in (
    "This card authorization does not belong to LetsGoRide Ride Now.",
    "This card authorization does not match the selected Ride Now fare.",
    "This card authorization belongs to another account.",
):
    replace_once(
        "backend/app/services/stripe_payment_service.py",
        f'        raise PermissionError("{message}")',
        f'        raise ValueError("{message}")',
    )

# Remove an inert line that existed only while scaffolding the webhook record update.
replace_once(
    "backend/app/services/stripe_payment_service.py",
    '        await database.update_one(record["id"], record["id"], {}) if False else None\n',
    "",
)

# ---------------------------------------------------------------------------
# Customer app: Cash remains default; Card appears only when backend config says
# it is enabled. PaymentSheet authorizes first, then the ride request is sent.
# ---------------------------------------------------------------------------
replace_once(
    "mobile/app/(customer)/hail/index.tsx",
    'import { MaterialCommunityIcons } from "@expo/vector-icons";\nimport { useRouter } from "expo-router";\n',
    'import { MaterialCommunityIcons } from "@expo/vector-icons";\nimport { initStripe, useStripe } from "@stripe/stripe-react-native";\nimport * as Linking from "expo-linking";\nimport { useRouter } from "expo-router";\n',
)
replace_once(
    "mobile/app/(customer)/hail/index.tsx",
    'import { createHailingQuote, requestHailingTrip } from "../../../services/hailingService";\n',
    'import { createHailingQuote, prepareHailingCardPayment, requestHailingTrip } from "../../../services/hailingService";\n',
)
replace_once(
    "mobile/app/(customer)/hail/index.tsx",
    '  const { trip: activeTrip, reload: reloadActive } = useActiveHailingTrip(false);\n',
    '  const { trip: activeTrip, reload: reloadActive } = useActiveHailingTrip(false);\n  const { initPaymentSheet, presentPaymentSheet } = useStripe();\n',
)
replace_once(
    "mobile/app/(customer)/hail/index.tsx",
    '  const [verifyWithPin, setVerifyWithPin] = useState(false);\n  const [error, setError] = useState<string | null>(null);\n',
    '  const [verifyWithPin, setVerifyWithPin] = useState(false);\n  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card">("cash");\n  const [paymentStage, setPaymentStage] = useState<"idle" | "authorizing" | "requesting">("idle");\n  const [error, setError] = useState<string | null>(null);\n',
)
replace_once(
    "mobile/app/(customer)/hail/index.tsx",
    '  const routeReady = Boolean(pickup && dropoff);\n',
    '  const routeReady = Boolean(pickup && dropoff);\n  const cardEnabled = Boolean(config?.digital_payments?.includes("card"));\n',
)
replace_once(
    "mobile/app/(customer)/hail/index.tsx",
    '''  async function requestRide() {\n    if (!quote) {\n      await loadQuote(selectedClass);\n      return;\n    }\n    try {\n      setRequesting(true);\n      setError(null);\n      const trip = await requestHailingTrip({\n        quote_id: quote.quote_id,\n        payment_method: "cash",\n        client_request_id: `hail-${quote.quote_id}`,\n        verify_ride_with_pin: verifyWithPin,\n      });\n      router.replace(`/(customer)/hail/searching?tripId=${encodeURIComponent(trip.id)}` as never);\n    } catch (err) {\n      setError(err instanceof Error ? err.message : "Unable to request your ride.");\n    } finally {\n      setRequesting(false);\n    }\n  }\n''',
    '''  async function requestRide() {\n    if (!quote) {\n      await loadQuote(selectedClass);\n      return;\n    }\n    const clientRequestId = `hail-${quote.quote_id}`;\n    try {\n      setRequesting(true);\n      setError(null);\n      let paymentIntentId: string | undefined;\n      if (paymentMethod === "card") {\n        if (!cardEnabled) throw new Error("Card payments are not available right now.");\n        setPaymentStage("authorizing");\n        const setup = await prepareHailingCardPayment({\n          quote_id: quote.quote_id,\n          client_request_id: clientRequestId,\n        });\n        await initStripe({\n          publishableKey: setup.publishable_key,\n          urlScheme: Linking.createURL("stripe-redirect"),\n        });\n        const sheet = await initPaymentSheet({\n          merchantDisplayName: "LetsGoRide",\n          paymentIntentClientSecret: setup.client_secret,\n          returnURL: Linking.createURL("stripe-redirect"),\n          style: "automatic",\n        });\n        if (sheet.error) throw new Error(sheet.error.message || "Unable to prepare card payment.");\n        const presented = await presentPaymentSheet();\n        if (presented.error) {\n          if (String(presented.error.code || "").toLowerCase().includes("cancel")) return;\n          throw new Error(presented.error.message || "Card authorization was not completed.");\n        }\n        paymentIntentId = setup.payment_intent_id;\n      }\n      setPaymentStage("requesting");\n      const trip = await requestHailingTrip({\n        quote_id: quote.quote_id,\n        payment_method: paymentMethod,\n        payment_intent_id: paymentIntentId,\n        client_request_id: clientRequestId,\n        verify_ride_with_pin: verifyWithPin,\n      });\n      router.replace(`/(customer)/hail/searching?tripId=${encodeURIComponent(trip.id)}` as never);\n    } catch (err) {\n      setError(err instanceof Error ? err.message : "Unable to request your ride.");\n    } finally {\n      setPaymentStage("idle");\n      setRequesting(false);\n    }\n  }\n''',
)
replace_once(
    "mobile/app/(customer)/hail/index.tsx",
    '''      : requesting\n        ? "Sending your ride request…"\n        : quoting\n''',
    '''      : requesting\n        ? paymentStage === "authorizing"\n          ? "Authorizing your card…"\n          : "Sending your ride request…"\n        : quoting\n''',
)
replace_once(
    "mobile/app/(customer)/hail/index.tsx",
    '<View style={styles.quoteMetric}><Text style={styles.quoteMetricLabel}>CASH FARE</Text><Text style={styles.quoteMetricValue}>${quote.fare.total_fare.toFixed(2)}</Text></View>',
    '<View style={styles.quoteMetric}><Text style={styles.quoteMetricLabel}>FARE</Text><Text style={styles.quoteMetricValue}>${quote.fare.total_fare.toFixed(2)}</Text></View>',
)
replace_once(
    "mobile/app/(customer)/hail/index.tsx",
    '''          {quote ? (\n            <Pressable accessibilityRole="switch" accessibilityState={{ checked: verifyWithPin }} onPress={() => setVerifyWithPin((current) => !current)} style={({ pressed }) => [styles.pinOption, pressed && styles.pressed]}>\n''',
    '''          {quote ? (\n            <View style={styles.paymentSection}>\n              <Text style={styles.sectionTitle}>Payment</Text>\n              <View style={styles.paymentRail}>\n                <Pressable\n                  accessibilityRole="radio"\n                  accessibilityState={{ selected: paymentMethod === "cash" }}\n                  onPress={() => setPaymentMethod("cash")}\n                  style={({ pressed }) => [styles.paymentOption, paymentMethod === "cash" && styles.paymentOptionSelected, pressed && styles.pressed]}\n                >\n                  <MaterialCommunityIcons name="cash" size={18} color={paymentMethod === "cash" ? "#FFFFFF" : RIDE_BLACK} />\n                  <Text style={[styles.paymentOptionText, paymentMethod === "cash" && styles.paymentOptionTextSelected]}>Cash</Text>\n                </Pressable>\n                {cardEnabled ? (\n                  <Pressable\n                    accessibilityRole="radio"\n                    accessibilityState={{ selected: paymentMethod === "card" }}\n                    onPress={() => setPaymentMethod("card")}\n                    style={({ pressed }) => [styles.paymentOption, paymentMethod === "card" && styles.paymentOptionSelected, pressed && styles.pressed]}\n                  >\n                    <MaterialCommunityIcons name="credit-card-outline" size={18} color={paymentMethod === "card" ? "#FFFFFF" : RIDE_BLACK} />\n                    <Text style={[styles.paymentOptionText, paymentMethod === "card" && styles.paymentOptionTextSelected]}>Card</Text>\n                  </Pressable>\n                ) : null}\n              </View>\n              {paymentMethod === "card" ? <Text style={styles.paymentHint}>Your card is authorized before matching and charged only when the trip completes.</Text> : null}\n            </View>\n          ) : null}\n\n          {quote ? (\n            <Pressable accessibilityRole="switch" accessibilityState={{ checked: verifyWithPin }} onPress={() => setVerifyWithPin((current) => !current)} style={({ pressed }) => [styles.pinOption, pressed && styles.pressed]}>\n''',
)
replace_once(
    "mobile/app/(customer)/hail/index.tsx",
    '  quoteDivider: { width: 1, height: 34, marginHorizontal: 10, backgroundColor: v2Theme.colors.lineStrong },\n  pinOption:',
    '''  quoteDivider: { width: 1, height: 34, marginHorizontal: 10, backgroundColor: v2Theme.colors.lineStrong },\n  paymentSection: { gap: 7 },\n  paymentRail: { flexDirection: "row", gap: 8 },\n  paymentOption: { flex: 1, minHeight: 44, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, backgroundColor: "#F7F7F5", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },\n  paymentOptionSelected: { backgroundColor: RIDE_BLACK, borderColor: RIDE_BLACK },\n  paymentOptionText: { color: v2Theme.colors.ink, fontSize: 11, fontWeight: "900" },\n  paymentOptionTextSelected: { color: "#FFFFFF" },\n  paymentHint: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 13 },\n  pinOption:''',
)

# If Stripe is switched off remotely after Card was selected, fail back to Cash.
replace_once(
    "mobile/app/(customer)/hail/index.tsx",
    '''  useEffect(() => {\n    setQuote(null);\n  }, [\n''',
    '''  useEffect(() => {\n    if (!cardEnabled && paymentMethod === "card") setPaymentMethod("cash");\n  }, [cardEnabled, paymentMethod]);\n\n  useEffect(() => {\n    setQuote(null);\n  }, [\n''',
)

# ---------------------------------------------------------------------------
# Regression tests. Stripe network calls are mocked; no credentials are needed
# in CI and no real payment can be created by the test suite.
# ---------------------------------------------------------------------------
write(
    "backend/tests/test_stripe_hailing_payments.py",
    '''import hashlib\nimport hmac\nimport json\nimport time\nimport unittest\nfrom types import SimpleNamespace\nfrom unittest.mock import AsyncMock, patch\n\nfrom app.database import COLLECTION_NAMES, database\nfrom app.services.stripe_payment_service import (\n    prepare_hailing_card_authorization,\n    process_stripe_webhook_event,\n    stripe_card_payments_available,\n    validate_hailing_card_authorization,\n    verify_stripe_webhook,\n)\n\n\nclass StripeHailingPaymentTests(unittest.IsolatedAsyncioTestCase):\n    async def asyncSetUp(self):\n        database.db = None\n        database.client = None\n        database.status = "not_configured"\n        for collection in COLLECTION_NAMES:\n            await database.replace_collection(collection, [])\n        self.user = {"id": "passenger-1", "role": "passenger", "name": "Passenger"}\n        self.quote = await database.insert_one(\n            "hailing_quotes",\n            {\n                "id": "quote-card-123",\n                "user_id": self.user["id"],\n                "city_id": "zw-harare",\n                "fare": {"ride_class": "ECONOMY", "total_fare": 4.25},\n                "expires_at": "2999-01-01T00:00:00+00:00",\n            },\n        )\n\n    def settings(self, *, production=False, enabled=True):\n        return SimpleNamespace(\n            is_production=production,\n            app_env="production" if production else "staging",\n            stripe_card_payments_enabled=enabled,\n            stripe_secret_key="sk_live_secret" if production else "sk_test_secret",\n            stripe_publishable_key="pk_live_public" if production else "pk_test_public",\n            stripe_webhook_secret="whsec_test_secret",\n        )\n\n    def test_environment_mode_fails_closed_on_mixed_keys(self):\n        staging = self.settings()\n        self.assertTrue(stripe_card_payments_available(staging))\n        staging.stripe_secret_key = "sk_live_wrong"\n        self.assertFalse(stripe_card_payments_available(staging))\n        production = self.settings(production=True)\n        self.assertTrue(stripe_card_payments_available(production))\n        production.stripe_publishable_key = "pk_test_wrong"\n        self.assertFalse(stripe_card_payments_available(production))\n\n    async def test_setup_uses_server_quote_and_manual_capture(self):\n        created = {\n            "id": "pi_card_1",\n            "object": "payment_intent",\n            "amount": 425,\n            "currency": "usd",\n            "status": "requires_payment_method",\n            "client_secret": "pi_card_1_secret_client",\n            "metadata": {\n                "platform": "letsgoride",\n                "product": "hailing",\n                "quote_id": self.quote["id"],\n                "passenger_user_id": self.user["id"],\n            },\n        }\n        stripe = AsyncMock(return_value=created)\n        with patch("app.services.stripe_payment_service.get_settings", return_value=self.settings()), patch(\n            "app.services.stripe_payment_service._stripe_request", stripe\n        ):\n            setup = await prepare_hailing_card_authorization(self.quote["id"], "client-request-1", self.user)\n        self.assertEqual(setup["amount"], 425)\n        self.assertEqual(setup["payment_intent_id"], "pi_card_1")\n        request = stripe.await_args\n        self.assertEqual(request.args[:2], ("POST", "/payment_intents"))\n        self.assertEqual(request.kwargs["data"]["amount"], 425)\n        self.assertEqual(request.kwargs["data"]["capture_method"], "manual")\n        self.assertEqual(request.kwargs["data"]["payment_method_types[]"], "card")\n\n    async def test_trip_validation_requires_requires_capture_and_exact_owner_amount(self):\n        authorized = {\n            "id": "pi_card_2",\n            "amount": 425,\n            "currency": "usd",\n            "status": "requires_capture",\n            "metadata": {\n                "platform": "letsgoride",\n                "product": "hailing",\n                "quote_id": self.quote["id"],\n                "passenger_user_id": self.user["id"],\n            },\n        }\n        with patch("app.services.stripe_payment_service.get_settings", return_value=self.settings()), patch(\n            "app.services.stripe_payment_service._stripe_request", new=AsyncMock(return_value=authorized)\n        ):\n            result = await validate_hailing_card_authorization(self.quote, "pi_card_2", self.user)\n        self.assertEqual(result["status"], "requires_capture")\n        bad = dict(authorized, amount=999)\n        with patch("app.services.stripe_payment_service.get_settings", return_value=self.settings()), patch(\n            "app.services.stripe_payment_service._stripe_request", new=AsyncMock(return_value=bad)\n        ):\n            with self.assertRaises(ValueError):\n                await validate_hailing_card_authorization(self.quote, "pi_card_2", self.user)\n\n    def test_webhook_signature_is_verified_before_parsing(self):\n        body = json.dumps({"id": "evt_1", "type": "payment_intent.succeeded", "data": {"object": {}}}, separators=(",", ":")).encode()\n        timestamp = int(time.time())\n        signature = hmac.new(b"whsec_test_secret", str(timestamp).encode() + b"." + body, hashlib.sha256).hexdigest()\n        with patch("app.services.stripe_payment_service.get_settings", return_value=self.settings()):\n            parsed = verify_stripe_webhook(body, f"t={timestamp},v1={signature}")\n            self.assertEqual(parsed["id"], "evt_1")\n            with self.assertRaises(PermissionError):\n                verify_stripe_webhook(body, f"t={timestamp},v1=wrong")\n\n    async def test_webhook_reconciliation_is_idempotent(self):\n        await database.insert_one(\n            "hailing_trips",\n            {"id": "trip-card", "payment_intent_id": "pi_card_3", "payment_method": "card", "payment_status": "authorized"},\n        )\n        event = {\n            "id": "evt_paid",\n            "type": "payment_intent.succeeded",\n            "data": {\n                "object": {\n                    "id": "pi_card_3",\n                    "object": "payment_intent",\n                    "status": "succeeded",\n                    "metadata": {"platform": "letsgoride", "product": "hailing"},\n                }\n            },\n        }\n        first = await process_stripe_webhook_event(event)\n        second = await process_stripe_webhook_event(event)\n        self.assertTrue(first["changed"])\n        self.assertTrue(second["duplicate"])\n        trip = await database.find_one("hailing_trips", {"id": "trip-card"})\n        self.assertEqual(trip["payment_status"], "paid")\n\n\nif __name__ == "__main__":\n    unittest.main()\n''',
)

print("Stripe card payment patches applied successfully.")
