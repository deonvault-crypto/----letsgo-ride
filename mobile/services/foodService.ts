import { requestData } from "./api";
import {
  FoodOrder,
  FoodOrderCreatePayload,
  Restaurant,
  RestaurantMenu,
} from "../types/food.types";

export function listRestaurants() {
  return requestData<Restaurant[]>({ method: "GET", url: "/food/restaurants" });
}

export function getRestaurant(restaurantId: string) {
  return requestData<Restaurant>({ method: "GET", url: `/food/restaurants/${restaurantId}` });
}

export function getRestaurantMenu(restaurantId: string) {
  return requestData<RestaurantMenu>({ method: "GET", url: `/food/restaurants/${restaurantId}/menu` });
}

export function createFoodOrder(payload: FoodOrderCreatePayload) {
  return requestData<FoodOrder>({ method: "POST", url: "/food/orders", data: payload });
}

export function listMyFoodOrders() {
  return requestData<FoodOrder[]>({ method: "GET", url: "/food/orders/my" });
}

export function getFoodOrder(orderId: string) {
  return requestData<FoodOrder>({ method: "GET", url: `/food/orders/${orderId}` });
}

export function cancelFoodOrder(orderId: string, reason?: string) {
  return requestData<FoodOrder>({
    method: "POST",
    url: `/food/orders/${orderId}/cancel`,
    data: { reason: reason || null },
  });
}
