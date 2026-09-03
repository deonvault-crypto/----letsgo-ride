import { resolveNotificationRoute } from "../services/notificationRouting";

describe("notification routing", () => {
  it("resolves known targets inside the authenticated product", () => {
    expect(resolveNotificationRoute({ role: "merchant", data: { notification_target: "merchant_order", restaurant_id: "restaurant-1" } })).toBe("/(merchant)/restaurant/restaurant-1");
    expect(resolveNotificationRoute({ role: "courier", data: { notification_target: "courier_delivery", delivery_id: "delivery-1" } })).toBe("/(courier)/delivery/delivery-1");
    expect(resolveNotificationRoute({ role: "driver", data: { ride_id: "ride-1" } })).toBe("/(driver)/trip/ride-1");
    expect(resolveNotificationRoute({ role: "passenger", data: { ride_id: "ride-1" } })).toBe("/(customer)/ride/ride-1");
    expect(resolveNotificationRoute({ role: "driver", data: { notification_target: "hailing_trip", hailing_trip_id: "hail-1" } })).toBe("/(driver)/hailing/trip/hail-1");
    expect(resolveNotificationRoute({ role: "passenger", data: { notification_target: "hailing_trip", hailing_trip_id: "hail-1" } })).toBe("/(customer)/hail/trip/hail-1");
    expect(resolveNotificationRoute({ role: "passenger", notificationType: "support_reply", data: { support_message_id: "support-1" } })).toBe("/(shared)/support?supportMessageId=support-1");
  });

  it("rejects cross-product and route-injection payloads", () => {
    expect(resolveNotificationRoute({ role: "passenger", data: { notification_target: "merchant_order", restaurant_id: "restaurant-1" } })).toBeNull();
    expect(resolveNotificationRoute({ role: "merchant", data: { notification_target: "hailing_trip", hailing_trip_id: "hail-1" } })).toBeNull();
    expect(resolveNotificationRoute({ role: "passenger", data: { ride_id: "../../(admin)/dashboard" } })).toBeNull();
    expect(resolveNotificationRoute({ role: "passenger", data: { support_message_id: "../../(admin)/dashboard" } })).toBeNull();
    expect(resolveNotificationRoute({ role: null, data: { support_message_id: "support-1" } })).toBeNull();
  });
});
