import { CourierDelivery } from "../types/courier.types";
import { FoodOrder } from "../types/food.types";
import { RideRequest } from "../types/ride.types";
import { requestData } from "./api";

export type ActivitySnapshot = {
  rides: RideRequest[];
  food_orders: FoodOrder[];
  courier_deliveries: CourierDelivery[];
};

export function getActivitySnapshot() {
  return requestData<ActivitySnapshot>({ method: "GET", url: "/activity" });
}
