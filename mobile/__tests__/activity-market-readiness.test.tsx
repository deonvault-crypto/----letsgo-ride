import { act, render, waitFor } from "@testing-library/react-native";

import ActivityScreen from "../app/(shared)/activity";
import { getActivitySnapshot } from "../services/activityService";
import { RealtimeEventEnvelope } from "../types/realtime.types";

const mockSession = { loading: false, isGuest: false };
const mockRealtime = { reconciliationRevision: 0, subscribe: jest.fn((_listener: (event: RealtimeEventEnvelope) => void) => jest.fn()) };
let realtimeListener: ((event: RealtimeEventEnvelope) => void) | null = null;

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/activity",
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require("react");
    React.useEffect(() => callback(), [callback]);
  },
}));

jest.mock("../contexts/SessionContext", () => ({ useSession: () => mockSession }));
jest.mock("../contexts/RealtimeContext", () => ({ useRealtime: () => mockRealtime }));
jest.mock("../services/activityService", () => ({ getActivitySnapshot: jest.fn() }));

describe("Activity market-readiness states", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession.loading = false;
    mockSession.isGuest = false;
    mockRealtime.reconciliationRevision = 0;
    mockRealtime.subscribe.mockImplementation((listener: (event: RealtimeEventEnvelope) => void) => {
      realtimeListener = listener;
      return jest.fn();
    });
    (getActivitySnapshot as jest.Mock).mockResolvedValue({ rides: [], food_orders: [], courier_deliveries: [] });
  });

  it("shows an intentional guest state without making private API calls", async () => {
    mockSession.isGuest = true;
    const screen = render(<ActivityScreen />);

    await waitFor(() => expect(screen.getByText("Your activity lives here")).toBeOnTheScreen());
    expect(screen.getByText("Sign in")).toBeOnTheScreen();
    expect(screen.getByText("Create account")).toBeOnTheScreen();
    expect(getActivitySnapshot).not.toHaveBeenCalled();
  });

  it("separates active work from terminal history", async () => {
    (getActivitySnapshot as jest.Mock).mockResolvedValue({ rides: [], courier_deliveries: [], food_orders: [
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
    ] });

    const screen = render(<ActivityScreen />);
    await waitFor(() => expect(screen.getByText("In progress")).toBeOnTheScreen());
    expect(screen.getByText("History")).toBeOnTheScreen();
    expect(screen.getByText("Market Ready Kitchen")).toBeOnTheScreen();
    expect(screen.getByText("Past Kitchen")).toBeOnTheScreen();
  });

  it("keeps authenticated load failures visible and retryable", async () => {
    (getActivitySnapshot as jest.Mock).mockRejectedValue(new Error("Activity is temporarily unavailable."));
    const screen = render(<ActivityScreen />);
    await waitFor(() => expect(screen.getByText("Activity is temporarily unavailable.")).toBeOnTheScreen());
    expect(screen.getByText("Retry")).toBeOnTheScreen();
  });

  it("moves a Food order into history from an existing realtime event without polling", async () => {
    (getActivitySnapshot as jest.Mock).mockResolvedValue({
      rides: [], courier_deliveries: [], food_orders: [{
        id: "order-live", restaurant_id: "r1", customer_user_id: "u1", status: "PREPARING",
        restaurant_name: "Kitchen", delivery_address: "Harare", recipient_name: "Tariro",
        recipient_phone: "+263770000001", items: [], subtotal_usd: 8, realtime_version: 1,
        created_at: "2026-08-23T10:00:00Z",
      }],
    });
    const screen = render(<ActivityScreen />);
    await waitFor(() => expect(screen.getByText("In progress")).toBeOnTheScreen());

    act(() => realtimeListener?.({
      event_id: "event-2", type: "food_order.terminal", resource_type: "food_order",
      resource_id: "order-live", version: 2, occurred_at: "2026-08-23T10:10:00Z",
      payload: { status: "DELIVERED", realtime_version: 2 },
    }));

    await waitFor(() => expect(screen.getByText("History")).toBeOnTheScreen());
    expect(screen.queryByText("In progress")).toBeNull();
    expect(getActivitySnapshot).toHaveBeenCalledTimes(1);
  });

  it("reflects Ride lifecycle and Courier terminal events without duplicating entries", async () => {
    (getActivitySnapshot as jest.Mock).mockResolvedValue({
      food_orders: [],
      rides: [{
        id: "request-live", ride_id: "ride-live", user_id: "u1", passenger_name: "Tariro",
        status: "confirmed", realtime_version: 1, created_at: "2026-08-23T09:00:00Z",
        ride_snapshot: {
          id: "ride-live", origin: "Harare", destination: "Mutare", status: "SCHEDULED",
          available_seats: 2, price_usd: 12, date: "2026-09-01", time: "08:00", realtime_version: 1,
        },
      }],
      courier_deliveries: [{
        id: "delivery-live", sender_user_id: "u1", status: "MATCHING", package_type: "DOCUMENTS",
        pickup_address: "Joina City, Harare", dropoff_address: "Avondale, Harare",
        realtime_version: 1, created_at: "2026-08-23T10:00:00Z",
      }],
    });
    const screen = render(<ActivityScreen />);
    await waitFor(() => expect(screen.getByText("In progress")).toBeOnTheScreen());

    const rideTerminal: RealtimeEventEnvelope = {
      event_id: "ride-terminal", type: "ride.terminal", resource_type: "ride", resource_id: "ride-live",
      version: 2, occurred_at: "2026-08-23T11:00:00Z", payload: { status: "COMPLETED", realtime_version: 2 },
    };
    const courierTerminal: RealtimeEventEnvelope = {
      event_id: "courier-terminal", type: "courier_delivery.terminal", resource_type: "courier_delivery",
      resource_id: "delivery-live", version: 2, occurred_at: "2026-08-23T11:00:00Z",
      payload: { status: "DELIVERED", realtime_version: 2 },
    };
    act(() => { realtimeListener?.(rideTerminal); realtimeListener?.(courierTerminal); realtimeListener?.(courierTerminal); });

    await waitFor(() => expect(screen.queryByText("In progress")).toBeNull());
    expect(screen.getByText("History")).toBeOnTheScreen();
    expect(screen.getAllByText("Joina City, Harare → Avondale, Harare")).toHaveLength(1);

    act(() => realtimeListener?.({ ...rideTerminal, event_id: "unrelated", resource_id: "other-ride", version: 99 }));
    expect(getActivitySnapshot).toHaveBeenCalledTimes(1);
  });
});
