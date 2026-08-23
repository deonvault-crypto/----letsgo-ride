import { requestData } from "./api";
import {
  FoodCheckoutQuote,
  FoodCheckoutQuotePayload,
  FoodOrder,
  FoodOrderCreatePayload,
  FoodOrderEvent,
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

export function previewFoodCheckout(payload: FoodCheckoutQuotePayload) {
  return requestData<FoodCheckoutQuote>({ method: "POST", url: "/food/checkout/quote", data: payload });
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

export function getFoodOrderEvents(orderId: string) {
  return requestData<FoodOrderEvent[]>({ method: "GET", url: `/food/orders/${orderId}/events` });
}

export function cancelFoodOrder(orderId: string, reason?: string) {
  return requestData<FoodOrder>({
    method: "POST",
    url: `/food/orders/${orderId}/cancel`,
    data: { reason: reason || null },
  });
}
