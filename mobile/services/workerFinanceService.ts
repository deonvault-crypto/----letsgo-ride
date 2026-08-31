import { requestData } from "./api";
import {
  DriverSettlementIntent,
  PayoutMethodCreatePayload,
  PayoutMethodUpdateInput,
  WorkerPayoutMethod,
  WorkerWallet,
} from "../types/workerFinance.types";

export async function getWorkerWallet() {
  return requestData<WorkerWallet>({ method: "GET", url: "/worker/finance/wallet" });
}

export async function createDriverSettlementIntent() {
  return requestData<DriverSettlementIntent>({ method: "POST", url: "/worker/finance/driver/settlements/intent" });
}

export async function confirmDriverSettlementPayment(paymentIntentId: string) {
  return requestData<Record<string, unknown>>({
    method: "POST",
    url: `/worker/finance/driver/settlements/confirm/${encodeURIComponent(paymentIntentId)}`,
  });
}

export async function createWorkerPayoutMethod(payload: PayoutMethodCreatePayload) {
  return requestData<WorkerPayoutMethod>({ method: "POST", url: "/worker/finance/payout-methods", data: payload });
}

export async function updateWorkerPayoutMethod(methodId: string, payload: PayoutMethodUpdateInput) {
  return requestData<WorkerPayoutMethod>({ method: "PATCH", url: `/worker/finance/payout-methods/${methodId}`, data: payload });
}

export async function setDefaultWorkerPayoutMethod(methodId: string) {
  return requestData<WorkerPayoutMethod>({ method: "POST", url: "/worker/finance/payout-methods/default", data: { method_id: methodId } });
}

export async function deleteWorkerPayoutMethod(methodId: string) {
  return requestData<{ deleted: boolean; id: string }>({ method: "DELETE", url: `/worker/finance/payout-methods/${methodId}` });
}
