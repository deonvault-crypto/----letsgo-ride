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
  service_area?: string | null;
  online_since?: string | null;
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
  pickup_address?: string | null;
  dropoff_address?: string | null;
  distance_km?: number | null;
  work_minutes?: number | null;
  payout_status?: null;
};

export type CourierEarningsPeriod = {
  accrued_earnings_usd: number;
  completed_deliveries: number;
  online_minutes: number;
  distance_km?: number | null;
};

export type CourierEarningsSummary = {
  currency: "USD" | string;
  completed_deliveries: number;
  total_payout_usd: number;
  today_payout_usd: number;
  last_7_days_payout_usd: number;
  month_payout_usd: number;
  latest_payouts: CourierPayoutItem[];
  periods: { today: CourierEarningsPeriod; week: CourierEarningsPeriod; month: CourierEarningsPeriod };
  weekly_chart: Array<{ date: string; accrued_earnings_usd: number }>;
  settlement_integrated: false;
  payout_history: [];
};

export type WorkerProduct = "courier" | "driver" | "merchant";
export type WorkerApplicationStatus = "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";
export type WorkerApplicationDocumentType = "identity_document" | "selfie" | "driver_licence" | "vehicle_registration" | "business_registration";

export type WorkerApplicationDocument = {
  id: string;
  document_type: WorkerApplicationDocumentType;
  file_name: string;
  file_url?: string | null;
  uploaded_at?: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | string;
  rejection_reason?: string | null;
};

export type WorkerApplication = {
  id: string;
  user_id: string;
  product: WorkerProduct;
  full_name: string;
  phone: string;
  service_area: string;
  vehicle?: string | null;
  experience?: string | null;
  business_name?: string | null;
  business_address?: string | null;
  business_registration_number?: string | null;
  accepted_terms: boolean;
  status: WorkerApplicationStatus;
  documents: WorkerApplicationDocument[];
  required_document_types: WorkerApplicationDocumentType[];
  missing_document_types: WorkerApplicationDocumentType[];
  review_note?: string | null;
  submitted_at?: string | null;
  approved_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type CourierShift = {
  id: string;
  zone: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  booked_count: number;
  remaining_places: number;
  booking_cutoff_minutes: number;
  incentive_usd?: number | null;
  active: boolean;
  status: "UPCOMING" | "IN_PROGRESS" | "COMPLETED" | "INACTIVE";
  booking_open: boolean;
};

export type CourierShiftBooking = {
  id: string;
  shift_id: string;
  courier_user_id: string;
  status: "BOOKED" | "COMPLETED" | "CANCELLED";
  booked_at: string;
  cancelled_at?: string | null;
  shift: CourierShift;
};
