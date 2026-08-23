export type Restaurant = {
  id: string;
  owner_user_id?: string | null;
  name: string;
  description?: string | null;
  phone?: string;
  address: string;
  cuisine_tags?: string[];
  opening_hours?: Record<string, string>;
  status?: "DRAFT" | "PENDING_REVIEW" | "ACTIVE" | "COMING_SOON" | string;
  is_accepting_orders?: boolean;
  is_orderable?: boolean;
  partner_status?: "DEMO" | "NOT_CONTRACTED" | "CONTRACTED" | string;
  demo_only?: boolean;
  rating?: number | null;
  review_count?: number;
  hero_image_url?: string | null;
  logo_url?: string | null;
};

export type MenuCategory = {
  id: string;
  restaurant_id: string;
  name: string;
  description?: string | null;
  sort_order?: number;
};

export type MenuItem = {
  id: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  description?: string | null;
  price_usd: number;
  image_url?: string | null;
  is_available?: boolean;
  preparation_minutes?: number | null;
};

export type RestaurantMenu = {
  restaurant: Restaurant;
  categories: MenuCategory[];
  items: MenuItem[];
};

export type FoodOrderStatus =
  | "PLACED"
  | "ACCEPTED"
  | "PREPARING"
  | "READY_FOR_PICKUP"
  | "COURIER_ASSIGNED"
  | "COURIER_TO_PICKUP"
  | "PICKED_UP"
  | "OUT_FOR_DELIVERY"
  | "ARRIVING"
  | "DELIVERED"
  | "CANCELLED"
  | "REJECTED";

export type FoodOrderItemPayload = {
  menu_item_id: string;
  quantity: number;
  note?: string | null;
};

export type FoodOrderCreatePayload = {
  restaurant_id: string;
  delivery_address: string;
  delivery_location?: { latitude?: number | null; longitude?: number | null } | null;
  recipient_name: string;
  recipient_phone: string;
  items: FoodOrderItemPayload[];
  customer_note?: string | null;
};

export type FoodOrder = {
  id: string;
  restaurant_id: string;
  restaurant_name?: string;
  customer_user_id: string;
  customer_name?: string;
  status: FoodOrderStatus;
  restaurant_status?: string;
  fulfillment_status?: string;
  payment_status?: string;
  delivery_address: string;
  delivery_location?: { latitude?: number | null; longitude?: number | null } | null;
  recipient_name: string;
  recipient_phone: string;
  customer_note?: string | null;
  items: Array<{
    menu_item_id: string;
    name?: string;
    quantity: number;
    unit_price_usd: number;
    line_total_usd: number;
    note?: string | null;
  }>;
  subtotal_usd: number;
  delivery_fee_usd?: number | null;
  total_usd?: number | null;
  pricing_status?: string;
  currency?: string;
  courier_delivery_id?: string | null;
  cancellation_reason?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type FoodOrderEvent = {
  id: string;
  order_id: string;
  type: string;
  actor_user_id?: string | null;
  data?: Record<string, unknown>;
  created_at: string;
};
