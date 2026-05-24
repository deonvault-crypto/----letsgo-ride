export type Conversation = {
  id: string;
  ride_id: string;
  request_id: string;
  driver_user_id: string;
  passenger_id: string;
  status: "active" | "closed";
  ride?: {
    id: string;
    origin: string;
    destination: string;
    date?: string;
    time?: string;
  } | null;
  request_status?: string | null;
  driver_name?: string;
  driver_profile_photo_url?: string;
  driver_verification_status?: string;
  passenger_name?: string;
  passenger_profile_photo_url?: string;
  passenger_verification_status?: string;
  other_user_name?: string;
  other_user_profile_photo_url?: string;
  last_message?: string | null;
  last_message_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type TripMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_by_driver?: boolean;
  read_by_passenger?: boolean;
  system?: boolean;
};

