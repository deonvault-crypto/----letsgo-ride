export type DriverProfile = {
  id?: string;
  name?: string;
  phone?: string;
  city?: string;
  status: string;
  verified: boolean;
  verification_status?: "not_started" | "pending" | "needs_review" | "verified" | "rejected" | "active";
  verification_provider?: "manual";
  verification_submitted_at?: string | null;
  verification_checked_at?: string | null;
  rating?: number;
  message?: string;
};

export type VehicleInput = {
  make: string;
  model: string;
  color: string;
  plate_number: string;
  seats: number;
};
