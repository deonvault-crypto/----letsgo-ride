import { FoodOrder, FoodOrderStatus, MenuCategory, MenuItem, Restaurant } from "./food.types";

export type MerchantRestaurant = Restaurant & {
  owner_user_id: string;
  status: "DRAFT" | "PENDING_REVIEW" | "ACTIVE" | string;
  is_accepting_orders: boolean;
  location?: { latitude?: number | null; longitude?: number | null } | null;
  created_at?: string;
  updated_at?: string;
};

export type RestaurantCreatePayload = {
  name: string;
  description?: string | null;
  phone: string;
  address: string;
  location?: { latitude?: number | null; longitude?: number | null } | null;
  cuisine_tags?: string[];
  opening_hours?: Record<string, string>;
};

export type RestaurantUpdatePayload = Partial<RestaurantCreatePayload> & {
  is_accepting_orders?: boolean;
  hero_image_url?: string | null;
  logo_url?: string | null;
};

export type MenuCategoryCreatePayload = {
  name: string;
  description?: string | null;
  sort_order?: number;
};

export type MenuItemCreatePayload = {
  category_id: string;
  name: string;
  description?: string | null;
  price_usd: number;
  image_url?: string | null;
  is_available?: boolean;
  preparation_minutes?: number | null;
};

export type MerchantDashboardData = {
  restaurant: MerchantRestaurant;
  categories: MenuCategory[];
  items: MenuItem[];
  orders: FoodOrder[];
};

export type MerchantOrderStatusPayload = {
  status: FoodOrderStatus;
  note?: string | null;
};
