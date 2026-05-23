export type UserRole = "passenger" | "driver";

export type User = {
  id: string;
  phone: string;
  name: string;
  city?: string;
  role: UserRole;
  rating?: number;
  token?: string;
};
