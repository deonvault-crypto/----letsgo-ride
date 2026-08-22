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
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED" | string;
  online: boolean;
  completed_deliveries?: number;
  rating?: number | null;
  created_at?: string;
  updated_at?: string;
};
