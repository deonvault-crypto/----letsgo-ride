import { render, waitFor } from "@testing-library/react-native";

import ActivityScreen from "../app/(shared)/activity";
import { hasSession } from "../services/authService";
import { listMyCourierDeliveries } from "../services/courierService";
import { listMyFoodOrders } from "../services/foodService";
import { myRideRequests } from "../services/ridesService";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/activity",
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require("react");
    React.useEffect(() => callback(), [callback]);
  },
}));

jest.mock("../services/authService", () => ({ hasSession: jest.fn() }));
jest.mock("../services/courierService", () => ({ listMyCourierDeliveries: jest.fn() }));
jest.mock("../services/foodService", () => ({ listMyFoodOrders: jest.fn() }));
jest.mock("../services/ridesService", () => ({ myRideRequests: jest.fn() }));

describe("Activity market-readiness states", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (myRideRequests as jest.Mock).mockResolvedValue([]);
    (listMyFoodOrders as jest.Mock).mockResolvedValue([]);
    (listMyCourierDeliveries as jest.Mock).mockResolvedValue([]);
  });

  it("shows an intentional guest state without making private API calls", async () => {
    (hasSession as jest.Mock).mockResolvedValue(false);
    const screen = render(<ActivityScreen />);

    await waitFor(() => expect(screen.getByText("Your activity lives here")).toBeOnTheScreen());
    expect(screen.getByText("Sign in")).toBeOnTheScreen();
    expect(screen.getByText("Create account")).toBeOnTheScreen();
    expect(myRideRequests).not.toHaveBeenCalled();
    expect(listMyFoodOrders).not.toHaveBeenCalled();
    expect(listMyCourierDeliveries).not.toHaveBeenCalled();
  });

  it("separates active work from terminal history", async () => {
    (hasSession as jest.Mock).mockResolvedValue(true);
    (listMyFoodOrders as jest.Mock).mockResolvedValue([
      {
        id: "active-order", restaurant_id: "r1", customer_user_id: "u1", status: "PREPARING",
        restaurant_name: "Market Ready Kitchen", delivery_address: "Harare", recipient_name: "Tariro",
        recipient_phone: "+263770000001", items: [], subtotal_usd: 8, created_at: "2026-08-23T10:00:00Z",
      },
      {
        id: "done-order", restaurant_id: "r1", customer_user_id: "u1", status: "DELIVERED",
        restaurant_name: "Past Kitchen", delivery_address: "Harare", recipient_name: "Tariro",
        recipient_phone: "+263770000001", items: [], subtotal_usd: 6, created_at: "2026-08-22T10:00:00Z",
      },
    ]);

    const screen = render(<ActivityScreen />);
    await waitFor(() => expect(screen.getByText("In progress")).toBeOnTheScreen());
    expect(screen.getByText("History")).toBeOnTheScreen();
    expect(screen.getByText("Market Ready Kitchen")).toBeOnTheScreen();
    expect(screen.getByText("Past Kitchen")).toBeOnTheScreen();
  });

  it("keeps authenticated load failures visible and retryable", async () => {
    (hasSession as jest.Mock).mockResolvedValue(true);
    (myRideRequests as jest.Mock).mockRejectedValue(new Error("Activity is temporarily unavailable."));
    const screen = render(<ActivityScreen />);
    await waitFor(() => expect(screen.getByText("Activity is temporarily unavailable.")).toBeOnTheScreen());
    expect(screen.getByText("Retry")).toBeOnTheScreen();
  });
});
