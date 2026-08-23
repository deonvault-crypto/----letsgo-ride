export type WorkAvailability = {
  id: string;
  user_id: string;
  mode: "ride" | "courier";
  date: string;
  start_time: string;
  end_time: string;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type CourierProfile = {
  id: string;
  user_id: string;
  name?: string;
  transport_mode: "bicycle" | "motorbike" | "car" | "van";
  vehicle_description?: string | null;
  status: "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "SUSPENDED" | string;
  online: boolean;
  completed_deliveries?: number;
  rating?: number | null;
  created_at?: string;
  updated_at?: string;
};

export type CourierPayoutItem = {
  delivery_id: string;
  payout_usd: number;
  delivered_at?: string | null;
  source_type?: string;
};

export type CourierEarningsSummary = {
  currency: "USD" | string;
  completed_deliveries: number;
  total_payout_usd: number;
  today_payout_usd: number;
  last_7_days_payout_usd: number;
  latest_payouts: CourierPayoutItem[];
};
