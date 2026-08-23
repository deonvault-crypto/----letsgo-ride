import { requestData } from "./api";
import { FoodOrder, MenuCategory, MenuItem } from "../types/food.types";
import {
  MenuCategoryCreatePayload,
  MenuItemCreatePayload,
  MerchantDashboardData,
  MerchantInsights,
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

export function updateMenuCategory(categoryId: string, payload: Partial<MenuCategoryCreatePayload>) {
  return requestData<MenuCategory>({ method: "PATCH", url: `/merchant/categories/${categoryId}`, data: payload });
}

export function deleteMenuCategory(categoryId: string) {
  return requestData<{ deleted: boolean }>({ method: "DELETE", url: `/merchant/categories/${categoryId}` });
}

export function createMenuItem(restaurantId: string, payload: MenuItemCreatePayload) {
  return requestData<MenuItem>({ method: "POST", url: `/merchant/restaurants/${restaurantId}/menu-items`, data: payload });
}

export function updateMenuItem(itemId: string, payload: Partial<MenuItemCreatePayload>) {
  return requestData<MenuItem>({ method: "PATCH", url: `/merchant/menu-items/${itemId}`, data: payload });
}

export function deleteMenuItem(itemId: string) {
  return requestData<{ deleted: boolean }>({ method: "DELETE", url: `/merchant/menu-items/${itemId}` });
}

export function getMerchantInsights(restaurantId: string) {
  return requestData<MerchantInsights>({ method: "GET", url: `/merchant/restaurants/${restaurantId}/insights` });
}

export function listRestaurantOrders(restaurantId: string) {
  return requestData<FoodOrder[]>({ method: "GET", url: `/merchant/restaurants/${restaurantId}/orders` });
}

export function updateMerchantOrderStatus(orderId: string, payload: MerchantOrderStatusPayload) {
  return requestData<FoodOrder>({ method: "POST", url: `/merchant/orders/${orderId}/status`, data: payload });
}
