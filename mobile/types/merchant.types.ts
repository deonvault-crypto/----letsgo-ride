import { FoodOrder, FoodOrderStatus, MenuCategory, MenuItem, Restaurant } from "./food.types";

export type MerchantRestaurant = Restaurant & {
  owner_user_id: string;
  status: "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "ACTIVE" | "REJECTED" | "SUSPENDED" | "PENDING_REVIEW" | string;
  is_accepting_orders: boolean;
  location?: { latitude?: number | null; longitude?: number | null } | null;
  business_registration_number?: string | null;
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
  hero_image_url?: string | null;
  logo_url?: string | null;
  contact_person_name?: string | null;
  contact_email?: string | null;
  business_registration_number?: string | null;
  pickup_instructions?: string | null;
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
  image_url?: string | null;
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

export type MerchantInsightsPeriod = {
  orders: number;
  completed_orders: number;
  recorded_sales_usd: number;
};

export type MerchantInsights = {
  currency: string;
  total_orders: number;
  accepted_orders: number;
  completed_orders: number;
  rejected_or_cancelled_orders: number;
  recorded_sales_usd: number;
  average_preparation_minutes?: number | null;
  periods: { today: MerchantInsightsPeriod; week: MerchantInsightsPeriod; month: MerchantInsightsPeriod };
  weekly_chart: Array<{ date: string; orders: number; recorded_sales_usd: number }>;
  payment_method: "CASH_ON_DELIVERY";
  settlement_integrated: false;
  payout_history: [];
};
