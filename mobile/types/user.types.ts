export type UserRole = "passenger" | "driver" | "admin";

export type User = {
  id: string;
  phone: string;
  email?: string;
  name: string;
  city?: string;
  role: UserRole;
  rating?: number;
  token?: string;
};
