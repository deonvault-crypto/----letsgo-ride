export type UserRole = "passenger" | "driver" | "admin";

export type User = {
  id: string;
  phone?: string;
  email?: string;
  name: string;
  city?: string;
  bio?: string;
  travel_preferences?: string;
  profile_photo_url?: string;
  profile_photo_name?: string;
  role: UserRole;
  rating?: number;
  token?: string;
};
