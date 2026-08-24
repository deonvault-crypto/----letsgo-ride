import { merchantOrderView } from "../app/(merchant)/home";
import { FoodOrder } from "../types/food.types";

function order(overrides: Partial<FoodOrder> = {}): FoodOrder {
  return {
    id: "order-1",
    restaurant_id: "restaurant-1",
    customer_user_id: "customer-1",
    status: "PENDING_RESTAURANT",
    delivery_address: "Joina City, Harare",
    recipient_name: "Release QA",
    recipient_phone: "+263700000000",
    items: [],
    subtotal_usd: 12,
    ...overrides,
  };
}

describe("merchant operational order grouping", () => {
  it.each([
    [order(), "new"],
    [order({ status: "PREPARING", restaurant_status: "PREPARING", fulfillment_status: "COURIER_TO_PICKUP" }), "preparing"],
    [order({ status: "READY_FOR_PICKUP", restaurant_status: "READY_FOR_PICKUP", fulfillment_status: "COURIER_ASSIGNED" }), "ready"],
    [order({ status: "PICKED_UP", restaurant_status: "READY_FOR_PICKUP", fulfillment_status: "OUT_FOR_DELIVERY" }), "fulfilling"],
    [order({ status: "DELIVERED", fulfillment_status: "DELIVERED" }), "completed"],
    [order({ status: "REJECTED", fulfillment_status: "CANCELLED" }), "closed"],
  ] as const)("keeps restaurant and fulfillment state truthful", (value, expected) => {
    expect(merchantOrderView(value)).toBe(expected);
  });
});
