import { fireEvent, render, waitFor } from "@testing-library/react-native";

import RequestSeatScreen from "../app/(customer)/request/[id]";
import CustomerTripsScreen from "../app/(customer)/my-trips";
import { updateCurrentUser } from "../services/authService";
import { getRide, requestSeat } from "../services/ridesService";
import { User } from "../types/user.types";
import { passengerUser, ride, rideRequest } from "./fixtures";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockReloadUser = jest.fn();
let mockUser: User | null = passengerUser;
let mockTrips = [rideRequest];
let mockPathname = "/request/ride-1";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useLocalSearchParams: () => ({ id: "ride-1" }),
  usePathname: () => mockPathname,
  useFocusEffect: (callback: () => void | (() => void)) => { const React = require("react"); React.useEffect(() => callback(), [callback]); },
}));

jest.mock("../hooks/useCurrentUser", () => ({ useCurrentUser: () => ({ user: mockUser, loading: false, isGuest: false, error: null, reload: mockReloadUser }) }));
jest.mock("../hooks/useTrips", () => ({ useTrips: () => ({ trips: mockTrips, loading: false, error: null, reload: jest.fn() }) }));
jest.mock("../services/authService", () => ({ updateCurrentUser: jest.fn() }));
jest.mock("../services/ridesService", () => ({ getRide: jest.fn(), requestSeat: jest.fn(), cancelMyRideRequest: jest.fn(), checkInRideRequest: jest.fn() }));
jest.mock("../services/conversationService", () => ({ listConversations: jest.fn(async () => []) }));
jest.mock("../services/reviewService", () => ({ listPendingReviews: jest.fn(async () => []) }));

describe("customer ride booking flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = passengerUser;
    mockTrips = [rideRequest];
    mockPathname = "/request/ride-1";
    (getRide as jest.Mock).mockResolvedValue(ride);
  });

  it("requires a phone number before booking a seat", async () => {
    mockUser = { ...passengerUser, phone: "" };
    const screen = render(<RequestSeatScreen />);
    await screen.findByText("Harare to Bulawayo");
    fireEvent.press(screen.getByRole("button", { name: "Confirm request" }));
    expect(screen.getByText("Add your phone number to continue")).toBeOnTheScreen();
    expect(requestSeat).not.toHaveBeenCalled();
  });

  it("sends a booking request and shows confirmation", async () => {
    (requestSeat as jest.Mock).mockResolvedValueOnce(rideRequest);
    const screen = render(<RequestSeatScreen />);
    await screen.findByText("Harare to Bulawayo");
    fireEvent.changeText(screen.getByLabelText("Message to driver"), "Small bag only");
    fireEvent.press(screen.getByRole("button", { name: "Confirm request" }));
    await waitFor(() => {
      expect(requestSeat).toHaveBeenCalledWith({ ride_id: "ride-1", passenger_name: "Tendai Moyo", passenger_phone: "+263771234567", passenger_note: "Small bag only", seats: 1 });
      expect(screen.getByText("Your seat request is pending.")).toBeOnTheScreen();
    });
  });

  it("shows backend booking errors clearly", async () => {
    (requestSeat as jest.Mock).mockRejectedValueOnce(new Error("Ride is no longer available."));
    const screen = render(<RequestSeatScreen />);
    await screen.findByText("Harare to Bulawayo");
    fireEvent.press(screen.getByRole("button", { name: "Confirm request" }));
    expect(await screen.findByText("Ride is no longer available.")).toBeOnTheScreen();
  });

  it("blocks requesting a ride that has already departed", async () => {
    (getRide as jest.Mock).mockResolvedValueOnce({ ...ride, status: "departed", is_departed: true });
    const screen = render(<RequestSeatScreen />);
    await screen.findByText("Harare to Bulawayo");
    expect(screen.getByText("Ride departed")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Ride departed" }));
    expect(requestSeat).not.toHaveBeenCalled();
  });

  it("saves phone from the completion modal and shows booked rides in customer trips", async () => {
    mockUser = { ...passengerUser, phone: "" };
    (updateCurrentUser as jest.Mock).mockResolvedValueOnce({ ...passengerUser, phone: "+263778888888" });
    const screen = render(<RequestSeatScreen />);
    await screen.findByText("Harare to Bulawayo");
    fireEvent.press(screen.getByRole("button", { name: "Add phone number" }));
    fireEvent.changeText(screen.getByLabelText("Phone number"), "+263778888888");
    fireEvent.press(screen.getByRole("button", { name: "Save phone number" }));
    await waitFor(() => { expect(updateCurrentUser).toHaveBeenCalledWith({ phone: "+263778888888" }); });
    mockPathname = "/my-trips";
    const tripsScreen = render(<CustomerTripsScreen />);
    expect(tripsScreen.getByText("Harare to Bulawayo")).toBeOnTheScreen();
    expect(tripsScreen.getByText("Small bag only")).toBeOnTheScreen();
  });
});
