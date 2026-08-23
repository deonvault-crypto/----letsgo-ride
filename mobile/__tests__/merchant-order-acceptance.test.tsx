import { fireEvent, render, waitFor } from "@testing-library/react-native";

import MerchantRestaurantScreen from "../app/(merchant)/restaurant/[restaurantId]";
import { getRestaurantWorkspace, updateMerchantOrderStatus } from "../services/merchantService";

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ restaurantId: "restaurant-1" }),
  usePathname: () => "/merchant/restaurant/restaurant-1",
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
}));

jest.mock("../services/merchantService", () => ({
  createMenuCategory: jest.fn(),
  createMenuItem: jest.fn(),
  getRestaurantWorkspace: jest.fn(),
  submitRestaurantForReview: jest.fn(),
  updateMerchantOrderStatus: jest.fn(),
  updateRestaurant: jest.fn(),
}));

const pendingOrder = {
  id: "food-order-123456",
  restaurant_id: "restaurant-1",
  restaurant_name: "Market Ready Kitchen",
  customer_user_id: "customer-1",
  status: "PENDING_RESTAURANT",
  restaurant_status: "PENDING_RESTAURANT",
  fulfillment_status: "NOT_STARTED",
  delivery_address: "Borrowdale, Harare",
  recipient_name: "Tariro",
  recipient_phone: "+263770000001",
  items: [{ menu_item_id: "item-1", name: "Chicken and chips", quantity: 1, unit_price_usd: 8, line_total_usd: 8 }],
  subtotal_usd: 8,
} as any;

describe("Merchant order acceptance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getRestaurantWorkspace as jest.Mock).mockResolvedValue({
      restaurant: {
        id: "restaurant-1",
        owner_user_id: "merchant-1",
        name: "Market Ready Kitchen",
        address: "Harare",
        status: "ACTIVE",
        is_accepting_orders: true,
      },
      categories: [],
      items: [],
      orders: [pendingOrder],
    });
    (updateMerchantOrderStatus as jest.Mock).mockResolvedValue({
      ...pendingOrder,
      status: "PREPARING",
      restaurant_status: "PREPARING",
      fulfillment_status: "MATCHING",
    });
  });

  it("requires an explicit restaurant response before preparation", async () => {
    const screen = render(<MerchantRestaurantScreen />);

    await waitFor(() => expect(screen.getByText("Accept order")).toBeOnTheScreen());
    expect(screen.getByText("Decline")).toBeOnTheScreen();
    expect(screen.getByText("Courier matching starts after acceptance")).toBeOnTheScreen();

    fireEvent.press(screen.getByText("Accept order"));
    await waitFor(() => expect(updateMerchantOrderStatus).toHaveBeenCalledWith(
      pendingOrder.id,
      { status: "PREPARING", note: null },
    ));
    expect(await screen.findByText("Order is ready for pickup")).toBeOnTheScreen();
  });
});
