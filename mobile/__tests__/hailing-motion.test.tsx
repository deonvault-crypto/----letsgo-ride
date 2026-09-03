import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { ScrollView, StyleSheet } from "react-native";

import HailingHomeScreen from "../app/(customer)/hail";
import HailingSearchingScreen from "../app/(customer)/hail/searching";
import { createHailingQuote, getPaymentConfig, requestHailingTrip } from "../services/hailingService";
import type { HailingTrip } from "../types/hailing.types";

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true };
const mockReload = jest.fn();
let mockWindow = { width: 320, height: 568, scale: 2, fontScale: 2 };
let mockTrip: HailingTrip | null = null;
let mockRealtime = "connected";
let mockError: string | null = null;
const mockDraft = {
  pickup: { address: "Joina City, Harare", location: { latitude: -17.825, longitude: 31.05 } },
  dropoff: { address: "An address with a long building name and detailed directions in Borrowdale, Harare", location: { latitude: -17.8, longitude: 31.08 } },
};
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ tripId: "trip-1" }) }));
jest.mock("@stripe/stripe-react-native", () => ({ initPaymentSheet: jest.fn(), initStripe: jest.fn(), presentPaymentSheet: jest.fn() }));
jest.mock("../components/hailing/HailingMapBackdrop", () => ({ HailingMapBackdrop: () => null }));
jest.mock("../components/hailing/RideClassCar", () => ({ RideClassCar: () => null }));
jest.mock("../components/layout/BottomNav", () => ({ BottomNav: () => null }));
jest.mock("../components/auth/AuthRequiredModal", () => ({ AuthRequiredModal: () => null }));
jest.mock("../contexts/LocationDraftContext", () => ({ useLocationDraft: () => mockDraft }));
jest.mock("../hooks/useMotionSettings", () => ({ useMotionSettings: () => ({ canAnimate: false }) }));
jest.mock("../hooks/useHailing", () => ({
  useHailingConfig: () => ({ config: { enabled: true, ride_classes: [{ id: "ECONOMY", label: "Economy", enabled: true }, { id: "COMFORT", label: "Comfort", enabled: true }, { id: "XL", label: "XL", enabled: false }] }, loading: false, reload: mockReload }),
  useActiveHailingTrip: () => ({ trip: mockTrip, loading: false, error: mockError, reload: mockReload, setTrip: jest.fn(), realtimeState: mockRealtime }),
}));
jest.mock("../services/authService", () => ({ hasSession: jest.fn(async () => true) }));
jest.mock("../services/hailingService", () => ({ getPaymentConfig: jest.fn(), createHailingQuote: jest.fn(), requestHailingTrip: jest.fn(), cancelHailingTrip: jest.fn() }));

const trip = (status: HailingTrip["status"]) => ({
  id: "trip-1", status, created_at: "2026-09-03T01:00:00Z",
  pickup: { formatted_address: "Joina City" }, dropoff: { formatted_address: "Borrowdale" },
  route: { distance_km: 5, duration_minutes: 12 }, fare: { total_fare: 9.5 },
}) as HailingTrip;

describe("booking and matching remain driven by user actions and server state", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTrip = null;
    mockRealtime = "connected";
    mockError = null;
    mockWindow = { width: 320, height: 568, scale: 2, fontScale: 2 };
    jest.spyOn(require("react-native"), "useWindowDimensions").mockImplementation(() => mockWindow);
    (getPaymentConfig as jest.Mock).mockResolvedValue({ card_enabled: false });
    (createHailingQuote as jest.Mock).mockResolvedValue({ quote_id: "quote-1", ride_class: "COMFORT", fare: { total_fare: 9.5 }, route: { distance_km: 5, duration_minutes: 12 } });
    (requestHailingTrip as jest.Mock).mockResolvedValue(trip("SEARCHING"));
  });
  afterEach(() => jest.restoreAllMocks());

  it("keeps class selection, server fares and confirmation in their existing order", async () => {
    const view = render(<HailingHomeScreen />);
    await waitFor(() => expect(getPaymentConfig).toHaveBeenCalledTimes(1));
    fireEvent.press(view.getByText("Comfort"));
    expect(requestHailingTrip).not.toHaveBeenCalled();
    fireEvent.press(view.getByText("See fare"));
    await view.findByText("Request ride · $9.50");
    expect(createHailingQuote).toHaveBeenCalledWith(expect.objectContaining({ ride_class: "COMFORT" }));
    expect(requestHailingTrip).not.toHaveBeenCalled();
    fireEvent.press(view.getByText("Request ride · $9.50"));
    await waitFor(() => expect(requestHailingTrip).toHaveBeenCalledTimes(1));
    expect(requestHailingTrip).toHaveBeenCalledWith(expect.objectContaining({ quote_id: "quote-1", payment_method: "cash", client_request_id: "hail-quote-1" }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/(customer)/hail/searching?tripId=trip-1"));
  });

  it("preserves disabled classes and caps measured content so long text remains scrollable", async () => {
    const view = render(<HailingHomeScreen />);
    await waitFor(() => expect(getPaymentConfig).toHaveBeenCalled());
    fireEvent.press(view.getByText("XL"));
    fireEvent.press(view.getByText("See fare"));
    await waitFor(() => expect(createHailingQuote).toHaveBeenCalledWith(expect.objectContaining({ ride_class: "ECONOMY" })));
    const scroll = view.UNSAFE_getAllByType(ScrollView).find((node) => !node.props.horizontal)!;
    act(() => scroll.props.onContentSizeChange(320, 1400));
    const sheet = StyleSheet.flatten(view.getByTestId("hailing-booking-sheet").props.style);
    expect(sheet.maxHeight).toBeLessThan(568 - 98 - 64);
    expect(sheet.height).toBeLessThanOrEqual(sheet.maxHeight);
    expect(view.getByText(mockDraft.dropoff.address)).toBeOnTheScreen();
    mockWindow = { ...mockWindow, height: 400, width: 568 };
    view.rerender(<HailingHomeScreen />);
    const rotatedSheet = StyleSheet.flatten(view.getByTestId("hailing-booking-sheet").props.style);
    expect(rotatedSheet.maxHeight).toBeLessThanOrEqual(400 - 98 - 64);
  });

  it("does not infer matching progress from age and opens the confirmed trip without waiting for motion", () => {
    mockTrip = trip("SEARCHING");
    const view = render(<HailingSearchingScreen />);
    expect(view.getByText("Finding a driver")).toBeOnTheScreen();
    expect(view.queryByText(/expanding|widening|across nearby/i)).toBeNull();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    mockTrip = trip("DRIVER_ASSIGNED");
    view.rerender(<HailingSearchingScreen />);
    expect(mockRouter.replace).toHaveBeenCalledWith("/(customer)/hail/trip/trip-1");
  });

  it("keeps reconnect and no-driver recovery available", () => {
    mockTrip = trip("SEARCHING");
    mockRealtime = "reconnecting";
    mockError = "Connection lost";
    const view = render(<HailingSearchingScreen />);
    expect(view.getByText("Reconnecting…")).toBeOnTheScreen();
    fireEvent.press(view.getByText("Reconnect"));
    expect(mockReload).toHaveBeenCalledTimes(1);
    mockTrip = trip("NO_DRIVER_FOUND");
    mockError = null;
    view.rerender(<HailingSearchingScreen />);
    expect(view.getByText("No drivers nearby")).toBeOnTheScreen();
    fireEvent.press(view.getByText("Try another ride"));
    expect(mockRouter.replace).toHaveBeenCalledWith("/(customer)/hail");
  });
});
