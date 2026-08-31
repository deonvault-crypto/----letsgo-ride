import * as SecureStore from "expo-secure-store";

import { ApiRequestError, requestData } from "./api";


const OUTBOX_KEY = "letsgoride.critical-mutation-outbox.v1";
const MAX_ENTRIES = 12;

type CriticalMutationEntry = {
  id: string;
  dedupeKey: string;
  url: string;
  data?: unknown;
  checkUrl: string;
  successStatuses: string[];
  createdAt: string;
};

export type CriticalMutationSpec = Omit<CriticalMutationEntry, "id" | "createdAt">;

export class CriticalMutationQueuedError extends Error {
  constructor() {
    super("Connection dropped while confirming this action. It is saved securely and will retry automatically when LetsGoRide reconnects.");
    this.name = "CriticalMutationQueuedError";
  }
}

let flushPromise: Promise<void> | null = null;

function newEntryId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function readEntries(): Promise<CriticalMutationEntry[]> {
  const raw = await SecureStore.getItemAsync(OUTBOX_KEY).catch(() => null);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is CriticalMutationEntry => {
      if (!item || typeof item !== "object") return false;
      const row = item as Partial<CriticalMutationEntry>;
      return Boolean(
        typeof row.id === "string" &&
        typeof row.dedupeKey === "string" &&
        typeof row.url === "string" &&
        typeof row.checkUrl === "string" &&
        Array.isArray(row.successStatuses),
      );
    });
  } catch {
    await SecureStore.deleteItemAsync(OUTBOX_KEY).catch(() => undefined);
    return [];
  }
}

async function writeEntries(entries: CriticalMutationEntry[]) {
  if (!entries.length) {
    await SecureStore.deleteItemAsync(OUTBOX_KEY).catch(() => undefined);
    return;
  }
  const bounded = entries.slice(-MAX_ENTRIES);
  await SecureStore.setItemAsync(OUTBOX_KEY, JSON.stringify(bounded));
}

async function enqueue(spec: CriticalMutationSpec) {
  const entries = await readEntries();
  const entry: CriticalMutationEntry = {
    ...spec,
    id: newEntryId(),
    createdAt: new Date().toISOString(),
  };
  // New intent replaces an older pending intent for the same workflow action.
  await writeEntries([...entries.filter((item) => item.dedupeKey !== spec.dedupeKey), entry]);
  return entry;
}

async function removeEntry(id: string) {
  const entries = await readEntries();
  await writeEntries(entries.filter((item) => item.id !== id));
}

function isUncertainNetworkFailure(error: unknown) {
  return error instanceof ApiRequestError && error.status === undefined;
}

function shouldKeepForRetry(error: unknown) {
  return isUncertainNetworkFailure(error) || (error instanceof ApiRequestError && (error.status || 0) >= 500);
}

async function currentStatus(entry: CriticalMutationEntry): Promise<string | null> {
  const current = await requestData<Record<string, unknown> | null>({ method: "GET", url: entry.checkUrl });
  return current && typeof current.status === "string" ? current.status : null;
}

async function alreadyApplied(entry: CriticalMutationEntry) {
  const status = await currentStatus(entry);
  return Boolean(status && entry.successStatuses.includes(status));
}

/**
 * Persist intent before sending it. If the response is lost after the server
 * commits the action, reconciliation can prove the authoritative state and
 * safely remove the queued copy instead of duplicating the transition.
 */
export async function executeCriticalMutation<T>(spec: CriticalMutationSpec, execute: () => Promise<T>): Promise<T> {
  const entry = await enqueue(spec);
  try {
    const result = await execute();
    await removeEntry(entry.id);
    return result;
  } catch (error) {
    if (isUncertainNetworkFailure(error)) throw new CriticalMutationQueuedError();
    await removeEntry(entry.id);
    throw error;
  }
}

async function flushEntries() {
  const entries = await readEntries();
  for (const entry of entries) {
    try {
      if (await alreadyApplied(entry)) {
        await removeEntry(entry.id);
        continue;
      }
    } catch (error) {
      if (shouldKeepForRetry(error)) return;
      if (error instanceof ApiRequestError && [401, 403].includes(error.status || 0)) return;
    }

    try {
      await requestData<unknown>({ method: "POST", url: entry.url, data: entry.data });
      await removeEntry(entry.id);
    } catch (error) {
      if (shouldKeepForRetry(error)) return;
      // A 4xx can mean the first request succeeded but its response was lost and
      // the replay is now stale. Reconcile once more before discarding it.
      try {
        if (await alreadyApplied(entry)) {
          await removeEntry(entry.id);
          continue;
        }
      } catch (reconcileError) {
        if (shouldKeepForRetry(reconcileError)) return;
      }
      // Non-retryable or obsolete intents must never poison the outbox forever.
      await removeEntry(entry.id);
    }
  }
}

export async function flushCriticalMutationOutbox() {
  if (flushPromise) return flushPromise;
  flushPromise = flushEntries().finally(() => {
    flushPromise = null;
  });
  return flushPromise;
}
