import { UserRole } from "../types/user.types";

type NotificationRouteInput = {
  data?: Record<string, unknown> | null;
  notificationType?: string | null;
  role?: UserRole | null;
};

function opaqueId(value: unknown) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 128
    && /^[A-Za-z0-9_-]+$/.test(value)
    ? value
    : null;
}

export function resolveNotificationRoute({ data = {}, notificationType, role }: NotificationRouteInput): string | null {
  const target = typeof data?.notification_target === "string" ? data.notification_target : "";
  const restaurantId = opaqueId(data?.restaurant_id);
  const deliveryId = opaqueId(data?.delivery_id);
  const foodOrderId = opaqueId(data?.food_order_id);
  const conversationId = opaqueId(data?.conversation_id);
  const driverId = opaqueId(data?.driver_id);
  const rideId = opaqueId(data?.ride_id);
  const supportMessageId = opaqueId(data?.support_message_id);
  const reportId = opaqueId(data?.report_id);

  if (target === "merchant_order") {
    return role === "merchant" && restaurantId ? `/(merchant)/restaurant/${restaurantId}` : null;
  }
  if (target === "courier_delivery") {
    return role === "courier" && deliveryId ? `/(courier)/delivery/${deliveryId}` : null;
  }
  if (target === "customer_food_order") {
    return role === "passenger" && foodOrderId ? `/(shared)/food/order/${foodOrderId}` : null;
  }
  if (target === "customer_delivery") {
    return role === "passenger" && deliveryId ? `/(customer)/courier/${deliveryId}` : null;
  }

  if (conversationId && (role === "passenger" || role === "driver")) {
    return `/(shared)/conversation/${conversationId}`;
  }
  if ((notificationType === "driver_verification" || typeof data?.verification_status === "string") && role === "driver") {
    return "/(shared)/verification";
  }
  if (driverId && role === "admin") return `/(admin)/verification/${driverId}`;
  if (foodOrderId && role === "passenger") return `/(shared)/food/order/${foodOrderId}`;
  if (deliveryId && role === "courier") return `/(courier)/delivery/${deliveryId}`;
  if (deliveryId && role === "passenger") return `/(customer)/courier/${deliveryId}`;
  if (rideId && role === "driver") return `/(driver)/trip/${rideId}`;
  if (rideId && role === "passenger") return `/(customer)/ride/${rideId}`;
  if (supportMessageId && role) return "/(shared)/support";
  if (reportId && role) return "/(shared)/safety";
  return null;
}
