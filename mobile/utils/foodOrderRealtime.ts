import type { FoodOrder, FoodOrderEvent, FoodOrderStatus } from "../types/food.types";
import type { RealtimeEventEnvelope } from "../types/realtime.types";
import { decideRealtimeVersion, normalizeRealtimeVersion } from "./realtimeResource";


const TERMINAL = new Set<FoodOrderStatus>(["DELIVERED", "CANCELLED", "REJECTED"]);
const FOOD_EVENT_TYPES = new Set([
  "food_order.created",
  "food_order.updated",
  "food_order.fulfillment_updated",
  "food_order.terminal",
]);
const SAFE_FIELDS: Array<keyof FoodOrder> = [
  "status",
  "restaurant_status",
  "fulfillment_status",
  "courier_delivery_id",
  "delivery_fee_usd",
  "total_usd",
  "pricing_status",
  "cancellation_reason",
  "delivered_at",
  "cancelled_at",
  "updated_at",
];

export type FoodOrderEventResult = {
  order: FoodOrder;
  journeyEvent: FoodOrderEvent | null;
  applied: boolean;
  needsReconciliation: boolean;
};

export function applyFoodOrderEvent(current: FoodOrder, event: RealtimeEventEnvelope): FoodOrderEventResult {
  const ignored = { order: current, journeyEvent: null, applied: false, needsReconciliation: false };
  if (event.resource_type !== "food_order" || event.resource_id !== current.id || !FOOD_EVENT_TYPES.has(event.type)) {
    return ignored;
  }
  const decision = decideRealtimeVersion(current.realtime_version, event);
  if (decision === "ignore") return ignored;
  if (decision === "reconcile") return { ...ignored, needsReconciliation: true };

  const incomingStatus = event.payload.status;
  if (TERMINAL.has(current.status) && typeof incomingStatus === "string" && !TERMINAL.has(incomingStatus as FoodOrderStatus)) {
    return { ...ignored, needsReconciliation: true };
  }

  const order = { ...current, realtime_version: event.version } as FoodOrder;
  for (const field of SAFE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(event.payload, field)) {
      Object.assign(order, { [field]: event.payload[field] });
    }
  }
  return {
    order,
    journeyEvent: parseJourneyEvent(event.payload.journey_event, current.id),
    applied: true,
    needsReconciliation: false,
  };
}

export function foodOrderFromCreatedEvent(event: RealtimeEventEnvelope): FoodOrder | null {
  if (event.resource_type !== "food_order" || event.type !== "food_order.created") return null;
  const value = event.payload.merchant_ticket;
  if (!value || typeof value !== "object") return null;
  const ticket = value as Record<string, unknown>;
  if (ticket.id !== event.resource_id || typeof ticket.restaurant_id !== "string" || !Array.isArray(ticket.items)) return null;
  if (normalizeRealtimeVersion(ticket.realtime_version) !== event.version) return null;
  return {
    ...(ticket as unknown as FoodOrder),
    customer_user_id: "",
    recipient_phone: "",
    realtime_version: event.version,
  };
}

export function authoritativeFoodOrder(current: FoodOrder | null, next: FoodOrder) {
  if (!current) return next;
  const currentVersion = normalizeRealtimeVersion(current.realtime_version);
  const nextVersion = normalizeRealtimeVersion(next.realtime_version);
  if (nextVersion < currentVersion) return current;
  if (TERMINAL.has(current.status) && !TERMINAL.has(next.status)) return current;
  return next;
}

function parseJourneyEvent(value: unknown, orderId: string): FoodOrderEvent | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || typeof item.type !== "string" || typeof item.created_at !== "string") return null;
  return { id: item.id, order_id: orderId, type: item.type, created_at: item.created_at };
}
