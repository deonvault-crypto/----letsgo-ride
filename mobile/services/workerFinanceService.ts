import { requestData } from "./api";
import { PayoutMethodInput, WorkerPayoutMethod, WorkerWallet } from "../types/workerFinance.types";

export function getWorkerWallet() {
  return requestData<WorkerWallet>({ method: "GET", url: "/worker/finance/wallet" });
}

export function listWorkerPayoutMethods() {
  return requestData<WorkerPayoutMethod[]>({ method: "GET", url: "/worker/finance/payout-methods" });
}

export function createWorkerPayoutMethod(data: PayoutMethodInput) {
  return requestData<WorkerPayoutMethod>({ method: "POST", url: "/worker/finance/payout-methods", data });
}

export function updateWorkerPayoutMethod(id: string, data: PayoutMethodInput) {
  return requestData<WorkerPayoutMethod>({ method: "PATCH", url: `/worker/finance/payout-methods/${encodeURIComponent(id)}`, data });
}

export function setDefaultWorkerPayoutMethod(methodId: string) {
  return requestData<WorkerPayoutMethod>({ method: "POST", url: "/worker/finance/payout-methods/default", data: { method_id: methodId } });
}

export function deleteWorkerPayoutMethod(id: string) {
  return requestData<{ deleted: boolean; id: string }>({ method: "DELETE", url: `/worker/finance/payout-methods/${encodeURIComponent(id)}` });
}
