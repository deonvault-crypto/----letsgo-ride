export type ReviewRole = "driver" | "passenger" | "courier" | "restaurant" | "customer";
export type ReviewTransactionType = "intercity" | "hailing" | "courier" | "food_restaurant" | "food_courier";

export type ReviewCategoryRatings = Partial<Record<
  | "safety"
  | "punctuality"
  | "communication"
  | "vehicle_cleanliness"
  | "respectful_behavior"
  | "payment_reliability"
  | "delivery_time"
  | "package_handling"
  | "professionalism"
  | "food_quality"
  | "order_accuracy"
  | "packaging"
  | "delivery_experience"
  | "handling",
  number
>>;

export type PublicReview = {
  id: string;
  transaction_id?: string;
  transaction_type?: ReviewTransactionType;
  trip_id?: string;
  reviewer_role: ReviewRole;
  reviewee_role: ReviewRole;
  reviewer_name: string;
  rating: number;
  category_ratings?: ReviewCategoryRatings;
  comment?: string | null;
  created_at?: string;
};

export type ReviewSummary = {
  average_rating?: number | null;
  review_count: number;
  latest_reviews: PublicReview[];
  completed_trips_count?: number;
};

export type PendingReview = {
  transaction_id: string;
  transaction_type: ReviewTransactionType;
  trip_id?: string;
  reviewer_role: ReviewRole;
  reviewee_id: string;
  reviewee_role: ReviewRole;
  reviewee_name: string;
  category_keys?: Array<keyof ReviewCategoryRatings>;
  ride_origin?: string;
  ride_destination?: string;
  completed_at?: string;
};

export type ReviewCreateInput = {
  transaction_id: string;
  transaction_type: ReviewTransactionType;
  reviewee_id: string;
  rating: number;
  category_ratings: ReviewCategoryRatings;
  comment?: string;
  safety_report_requested?: boolean;
};

export type DriverPublicProfile = {
  id: string;
  driver_id: string;
  name: string;
  profile_photo_url?: string | null;
  verified: boolean;
  verification_status: string;
  rating?: number | null;
  average_rating?: number | null;
  review_count: number;
  completed_trips_count?: number;
  vehicle?: string | null;
  vehicle_name?: string | null;
  vehicle_color?: string | null;
  bio?: string | null;
  latest_reviews: PublicReview[];
};
