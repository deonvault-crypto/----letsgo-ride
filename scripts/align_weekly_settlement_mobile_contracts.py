from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def preserve_courier_payout_type_compatibility() -> None:
    types_path = ROOT / "mobile/types/workerFinance.types.ts"
    types_text = types_path.read_text(encoding="utf-8")
    alias_block = "\nexport type PayoutMethodCreateInput = PayoutMethodCreatePayload;\nexport type PayoutMethodUpdateInput = PayoutMethodUpdatePayload;\n"
    if "export type PayoutMethodUpdateInput" not in types_text:
        types_text += alias_block
        types_path.write_text(types_text, encoding="utf-8")

    service_path = ROOT / "mobile/services/workerFinanceService.ts"
    service = service_path.read_text(encoding="utf-8")
    service = service.replace("  PayoutMethodUpdatePayload,\n", "  PayoutMethodUpdateInput,\n")
    service = service.replace(
        "export async function updateWorkerPayoutMethod(methodId: string, payload: PayoutMethodUpdatePayload)",
        "export async function updateWorkerPayoutMethod(methodId: string, payload: PayoutMethodUpdateInput)",
    )
    service_path.write_text(service, encoding="utf-8")


def rewrite_build34_finance_contract() -> None:
    path = ROOT / "mobile/__tests__/build34-release-contract.test.ts"
    text = path.read_text(encoding="utf-8")
    old = '''  it("keeps cash driver economics at 100 percent and platform fee card-only", () => {\n    const wallet = readRepo("backend/app/services/worker_wallet_service.py");\n    expect(wallet).toContain('\"cash_policy\": \"driver_keeps_100_percent\"');\n    expect(wallet).toContain('\"platform_fee_policy\": \"card_only\"');\n    expect(wallet).toContain('\"amount_due_to_platform_usd\": 0.0');\n  });\n'''
    new = '''  it("uses weekly postpaid driver service fees without upfront funding", () => {\n    const wallet = readRepo("backend/app/services/worker_wallet_service.py");\n    const settlement = readRepo("backend/app/services/driver_weekly_settlement_service.py");\n    expect(wallet).toContain('\"cash_policy\": \"driver_collects_fare_directly\"');\n    expect(wallet).toContain('\"platform_fee_policy\": \"weekly_postpaid\"');\n    expect(wallet).toContain('\"amount_due_to_platform_usd\": settlement[\"amount_due_usd\"]');\n    expect(settlement).toContain('if str(trip.get("status") or "") != "COMPLETED"');\n    expect(settlement).toContain('fare.get("platform_commission")');\n    expect(settlement).toContain('ride_now_blocked');\n  });\n'''
    if new not in text:
        if old not in text:
            raise RuntimeError("Build 34 old finance contract anchor missing")
        text = text.replace(old, new, 1)
        path.write_text(text, encoding="utf-8")


def rewrite_worker_wallet_policy_contract() -> None:
    path = ROOT / "mobile/__tests__/worker-wallet-policy.test.ts"
    path.write_text(
        '''import { readFileSync } from "fs";
import { resolve } from "path";

const walletSource = readFileSync(resolve(__dirname, "../app/(shared)/wallet.tsx"), "utf8");
const walletBackend = readFileSync(resolve(__dirname, "../../backend/app/services/worker_wallet_service.py"), "utf8");
const settlementBackend = readFileSync(resolve(__dirname, "../../backend/app/services/driver_weekly_settlement_service.py"), "utf8");

describe("driver weekly settlement policy", () => {
  it("lets drivers earn first and only exposes settlement after a weekly statement is due", () => {
    expect(walletSource).toMatch(/Earn first\. Settle weekly\./i);
    expect(walletSource).toContain("wallet.driver_settlement.can_settle");
    expect(walletSource).toMatch(/Settle balance/i);
    expect(walletSource).toMatch(/Only completed weekly statements become payable/i);
  });

  it("keeps cash with the driver while accruing the exact completed-ride service fee", () => {
    expect(walletSource).toMatch(/Passenger pays you directly\. You keep the cash and settle LetsGoRide weekly\./i);
    expect(walletBackend).toContain('"platform_fee_policy": "weekly_postpaid"');
    expect(settlementBackend).toContain('if str(trip.get("status") or "") != "COMPLETED"');
    expect(settlementBackend).toContain('fee = _money(fare.get("platform_commission"))');
  });

  it("blocks only new Ride Now work after the weekly balance becomes overdue", () => {
    expect(settlementBackend).toContain('if summary["ride_now_blocked"]');
    expect(settlementBackend).toContain("Settle it in Wallet to receive new Ride Now requests");
  });
});
''',
        encoding="utf-8",
    )


def main() -> None:
    preserve_courier_payout_type_compatibility()
    rewrite_build34_finance_contract()
    rewrite_worker_wallet_policy_contract()
    print("Weekly settlement mobile contracts aligned")


if __name__ == "__main__":
    main()
