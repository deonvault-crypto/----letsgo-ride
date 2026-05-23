export type DriverProfile = {
  id?: string;
  name?: string;
  phone?: string;
  city?: string;
  status: string;
  verified: boolean;
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
