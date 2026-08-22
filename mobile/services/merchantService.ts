import { requestData } from "./api";
import { FoodOrder, MenuCategory, MenuItem } from "../types/food.types";
import {
  MenuCategoryCreatePayload,
  MenuItemCreatePayload,
  MerchantDashboardData,
  MerchantOrderStatusPayload,
  MerchantRestaurant,
  RestaurantCreatePayload,
  RestaurantUpdatePayload,
} from "../types/merchant.types";

export function listMyRestaurants() {
  return requestData<MerchantRestaurant[]>({ method: "GET", url: "/merchant/restaurants/my" });
}

export function getRestaurantWorkspace(restaurantId: string) {
  return requestData<MerchantDashboardData>({ method: "GET", url: `/merchant/restaurants/${restaurantId}/workspace` });
}

export function createRestaurant(payload: RestaurantCreatePayload) {
  return requestData<MerchantRestaurant>({ method: "POST", url: "/merchant/restaurants", data: payload });
}

export function updateRestaurant(restaurantId: string, payload: RestaurantUpdatePayload) {
  return requestData<MerchantRestaurant>({ method: "PATCH", url: `/merchant/restaurants/${restaurantId}`, data: payload });
}

export function submitRestaurantForReview(restaurantId: string) {
  return requestData<MerchantRestaurant>({ method: "POST", url: `/merchant/restaurants/${restaurantId}/submit` });
}

export function createMenuCategory(restaurantId: string, payload: MenuCategoryCreatePayload) {
  return requestData<MenuCategory>({ method: "POST", url: `/merchant/restaurants/${restaurantId}/categories`, data: payload });
}

export function createMenuItem(restaurantId: string, payload: MenuItemCreatePayload) {
  return requestData<MenuItem>({ method: "POST", url: `/merchant/restaurants/${restaurantId}/menu-items`, data: payload });
}

export function updateMenuItem(itemId: string, payload: Partial<MenuItemCreatePayload>) {
  return requestData<MenuItem>({ method: "PATCH", url: `/merchant/menu-items/${itemId}`, data: payload });
}

export function listRestaurantOrders(restaurantId: string) {
  return requestData<FoodOrder[]>({ method: "GET", url: `/merchant/restaurants/${restaurantId}/orders` });
}

export function updateMerchantOrderStatus(orderId: string, payload: MerchantOrderStatusPayload) {
  return requestData<FoodOrder>({ method: "POST", url: `/merchant/orders/${orderId}/status`, data: payload });
}
