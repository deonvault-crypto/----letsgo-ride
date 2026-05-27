export type ReviewRole = "driver" | "passenger";

export type ReviewCategoryRatings = {
  safety?: number;
  punctuality?: number;
  communication?: number;
  vehicle_cleanliness?: number;
  respectful_behavior?: number;
  payment_reliability?: number;
};

export type PublicReview = {
  id: string;
  trip_id: string;
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
  trip_id: string;
  reviewer_role: ReviewRole;
  reviewee_id: string;
  reviewee_role: ReviewRole;
  reviewee_name: string;
  ride_origin?: string;
  ride_destination?: string;
  completed_at?: string;
};

export type ReviewCreateInput = {
  trip_id: string;
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
