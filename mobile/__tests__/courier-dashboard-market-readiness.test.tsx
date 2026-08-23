import { render, waitFor } from "@testing-library/react-native";

import CourierHomeScreen from "../app/(courier)/home";
import {
  getActiveCourierDelivery,
  getCourierEarnings,
  getCourierProfile,
  listCourierOffers,
} from "../services/operationsService";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require("react");
    React.useEffect(() => callback(), [callback]);
  },
}));

jest.mock("../services/operationsService", () => ({
  claimCourierOffer: jest.fn(),
  getActiveCourierDelivery: jest.fn(),
  getCourierEarnings: jest.fn(),
  getCourierProfile: jest.fn(),
  listCourierOffers: jest.fn(),
  setCourierOnline: jest.fn(),
}));

const activeDelivery = {
  id: "54ec3842-dffc-4ffd-a073-7e300150656d",
  sender_user_id: "customer-1",
  status: "IN_TRANSIT",
  source_type: "COURIER_REQUEST",
  pickup_address: "joina city, harare",
  dropoff_address: "borrowdale, harare",
  pickup_location: { latitude: -17.8318, longitude: 31.046 },
  dropoff_location: { latitude: -17.78, longitude: 31.08 },
  recipient_name: "Tariro",
  recipient_phone: "+263770000001",
  package_type: "parcel",
} as any;

describe("Courier dashboard priority", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCourierProfile as jest.Mock).mockResolvedValue({ id: "profile-1", user_id: "courier-1", status: "APPROVED", online: false });
    (getActiveCourierDelivery as jest.Mock).mockResolvedValue(activeDelivery);
    (getCourierEarnings as jest.Mock).mockResolvedValue({ currency: "USD", completed_deliveries: 0, total_payout_usd: 0, today_payout_usd: 0, last_7_days_payout_usd: 0, latest_payouts: [] });
    (listCourierOffers as jest.Mock).mockResolvedValue([]);
  });

  it("keeps an active delivery dominant even when offline for new offers", async () => {
    const screen = render(<CourierHomeScreen />);
    await waitFor(() => expect(screen.getByText("Delivery in progress.")).toBeOnTheScreen());
    expect(screen.getByText("Offline for new offers. Your current delivery remains active and trackable.")).toBeOnTheScreen();
    expect(screen.getByText("Active delivery")).toBeOnTheScreen();
    expect(screen.queryByText("No active delivery")).toBeNull();
    expect(listCourierOffers).not.toHaveBeenCalled();
  });

  it("renders server idle truth after login instead of reviving a completed job", async () => {
    (getActiveCourierDelivery as jest.Mock).mockResolvedValueOnce(null);

    const screen = render(<CourierHomeScreen />);

    await waitFor(() => expect(screen.getByText("You’re offline")).toBeOnTheScreen());
    expect(screen.getByText("No active delivery")).toBeOnTheScreen();
    expect(screen.queryByText("Delivery in progress.")).toBeNull();
    expect(screen.queryByText("Active delivery")).toBeNull();
    expect(listCourierOffers).not.toHaveBeenCalled();
  });
});
