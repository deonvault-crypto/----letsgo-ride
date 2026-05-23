import { fireEvent, render, waitFor } from "@testing-library/react-native";

import PostTripScreen from "../app/(driver)/post-trip";
import { createRide } from "../services/ridesService";
import { getMyVerification } from "../services/verificationService";
import { User } from "../types/user.types";
import { driverUser, pendingProfile, ride, verifiedProfile } from "./fixtures";

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockUser: User | null = driverUser;

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  usePathname: () => "/post-trip",
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require("react");
    React.useEffect(() => callback(), [callback]);
  },
}));

jest.mock("../hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({
    user: mockUser,
    loading: false,
    error: null,
    reload: jest.fn(),
  }),
}));

jest.mock("../services/authService", () => ({
  updateCurrentUser: jest.fn(),
}));

jest.mock("../services/ridesService", () => ({
  createRide: jest.fn(),
}));

jest.mock("../services/verificationService", () => ({
  getMyVerification: jest.fn(),
}));

describe("driver post-trip flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = driverUser;
    (getMyVerification as jest.Mock).mockResolvedValue(verifiedProfile);
  });

  it("uses location selectors and date picker for post-trip fields", async () => {
    const screen = render(<PostTripScreen />);

    await waitFor(() => {
      expect(getMyVerification).toHaveBeenCalled();
    });

    fireEvent.press(screen.getByRole("button", { name: "Origin" }));
    fireEvent.press(screen.getByText("Mutare"));

    fireEvent.press(screen.getByRole("button", { name: "Destination" }));
    fireEvent.press(screen.getByText("Harare"));

    fireEvent.press(screen.getByRole("button", { name: "Date" }));
    fireEvent.press(screen.getByText("Tomorrow"));

    expect(screen.getByText("Mutare")).toBeOnTheScreen();
    expect(screen.getByText("Harare")).toBeOnTheScreen();
  });

  it("requires phone number before posting a trip", async () => {
    mockUser = { ...driverUser, phone: "" };

    const screen = render(<PostTripScreen />);

    await waitFor(() => {
      expect(getMyVerification).toHaveBeenCalled();
    });
    fireEvent.press(screen.getByRole("button", { name: "Publish trip" }));

    expect(screen.getByText("Add your phone number to continue")).toBeOnTheScreen();
    expect(createRide).not.toHaveBeenCalled();
  });

  it("requires approved manual verification before posting", async () => {
    (getMyVerification as jest.Mock).mockResolvedValueOnce(pendingProfile);

    const screen = render(<PostTripScreen />);

    await waitFor(() => {
      expect(screen.getByText("Verification required")).toBeOnTheScreen();
    });
    fireEvent.press(screen.getByRole("button", { name: "Publish trip" }));

    expect(screen.getByText("Complete driver verification before posting a trip.")).toBeOnTheScreen();
    expect(createRide).not.toHaveBeenCalled();
  });

  it("lets a verified driver post a trip successfully", async () => {
    (createRide as jest.Mock).mockResolvedValueOnce(ride);

    const screen = render(<PostTripScreen />);

    await waitFor(() => {
      expect(getMyVerification).toHaveBeenCalled();
    });
    fireEvent.press(screen.getByRole("button", { name: "Publish trip" }));

    await waitFor(() => {
      expect(createRide).toHaveBeenCalledWith(expect.objectContaining({
        origin: "Harare",
        destination: "Bulawayo",
        available_seats: 3,
        price_usd: 12,
      }));
      expect(mockReplace).toHaveBeenCalledWith("/(driver)/trip/ride-1");
    });
  });
});
