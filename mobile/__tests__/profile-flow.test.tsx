import { fireEvent, render, waitFor } from "@testing-library/react-native";

import EditProfileScreen from "../app/(shared)/edit-profile";
import ProfileScreen from "../app/(shared)/profile";
import { updateCurrentUser, uploadProfilePhoto } from "../services/authService";
import { getMyVerification } from "../services/verificationService";
import { User } from "../types/user.types";
import { notStartedProfile, passengerUser, pendingProfile, verifiedProfile } from "./fixtures";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockReload = jest.fn();
let mockCurrentUser: User | null = passengerUser;

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  usePathname: () => "/profile",
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require("react");
    React.useEffect(() => callback(), [callback]);
  },
}));

jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: jest.fn(async () => ({
    canceled: false,
    assets: [{ uri: "file:///profile.jpg", fileName: "profile.jpg" }],
  })),
}));

jest.mock("../hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({
    user: mockCurrentUser,
    loading: false,
    error: null,
    reload: mockReload,
  }),
}));

jest.mock("../services/authService", () => ({
  updateCurrentUser: jest.fn(),
  uploadProfilePhoto: jest.fn(),
}));

jest.mock("../services/verificationService", () => ({
  getMyVerification: jest.fn(),
}));

describe("profile update flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser = passengerUser;
    (getMyVerification as jest.Mock).mockResolvedValue(notStartedProfile);
  });

  it("shows the premium account summary, saves edits, and keeps updated fields visible", async () => {
    jest.useFakeTimers();
    const updatedUser: User = {
      ...passengerUser,
      name: "Tendai Chipo",
      phone: "+263779999999",
      city: "Mutare",
      bio: "Travels between Harare and Mutare",
      travel_preferences: "Quiet morning trips",
    };
    (updateCurrentUser as jest.Mock).mockResolvedValueOnce(updatedUser);

    const summary = render(<ProfileScreen />);
    expect(summary.getByText("Tendai Moyo")).toBeOnTheScreen();
    expect(summary.getByText("Harare")).toBeOnTheScreen();
    expect(summary.getByText("Current mode · Passenger")).toBeOnTheScreen();
    expect(summary.getByText("Identity verification")).toBeOnTheScreen();
    await waitFor(() => {
      expect(summary.getByText("Required before posting driver trips")).toBeOnTheScreen();
    });
    expect(summary.queryByText("Your driver account is verified")).toBeNull();
    fireEvent.press(summary.getByRole("button", { name: "Settings" }));
    expect(mockPush).toHaveBeenCalledWith("/(shared)/settings");
    summary.unmount();

    const screen = render(<EditProfileScreen />);
    expect(screen.getByDisplayValue("Tendai Moyo")).toBeOnTheScreen();
    expect(screen.getByDisplayValue("+263771234567")).toBeOnTheScreen();
    expect(screen.getByText("Harare")).toBeOnTheScreen();

    fireEvent.changeText(screen.getByLabelText("Full name"), "Tendai Chipo");
    fireEvent.changeText(screen.getByLabelText("Phone number"), "+263779999999");
    fireEvent.press(screen.getByRole("button", { name: "City" }));
    fireEvent.changeText(screen.getByPlaceholderText("Search or type a location"), "Mutare");
    fireEvent.press(screen.getByText("Mutare"));
    fireEvent.changeText(screen.getByLabelText("About"), "Travels between Harare and Mutare");
    fireEvent.changeText(screen.getByLabelText("Travel preferences"), "Quiet morning trips");
    fireEvent.press(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => {
      expect(updateCurrentUser).toHaveBeenCalledWith(expect.objectContaining({
        name: "Tendai Chipo",
        phone: "+263779999999",
        city: "Mutare",
        bio: "Travels between Harare and Mutare",
        travel_preferences: "Quiet morning trips",
      }));
      expect(screen.getByDisplayValue("Tendai Chipo")).toBeOnTheScreen();
      expect(screen.getByText("Mutare")).toBeOnTheScreen();
      expect(screen.getByText("Profile saved. Returning to profile...")).toBeOnTheScreen();
      expect(screen.getByText("Phone number saved. Verification may be required before booking or posting rides.")).toBeOnTheScreen();
    });
    jest.runOnlyPendingTimers();
    expect(mockReplace).toHaveBeenCalledWith("/(shared)/profile");

    mockCurrentUser = updatedUser;
    screen.rerender(<EditProfileScreen />);

    expect(screen.getByDisplayValue("Tendai Chipo")).toBeOnTheScreen();
    expect(screen.getByText("Mutare")).toBeOnTheScreen();
    expect(screen.queryByDisplayValue("")).not.toBeOnTheScreen();
    jest.useRealTimers();
  });

  it("shows driver verification under review after submission", async () => {
    (getMyVerification as jest.Mock).mockResolvedValueOnce(pendingProfile);

    const screen = render(<ProfileScreen />);

    await waitFor(() => {
      expect(screen.getByText("Driver verification")).toBeOnTheScreen();
      expect(screen.getByText("Verification under review")).toBeOnTheScreen();
      expect(screen.queryByText("Required before posting driver trips")).toBeNull();
    });
  });

  it("uses clear approved driver verification wording without confusing passenger identity", async () => {
    (getMyVerification as jest.Mock).mockResolvedValueOnce(verifiedProfile);

    const screen = render(<ProfileScreen />);

    await waitFor(() => {
      expect(screen.getByText("Driver verification")).toBeOnTheScreen();
      expect(screen.getByText("Driver verification approved")).toBeOnTheScreen();
      expect(screen.queryByText("Your driver account is verified")).toBeNull();
    });
  });

  it("stores profile photo metadata and keeps initials as fallback when no photo exists", async () => {
    (uploadProfilePhoto as jest.Mock).mockResolvedValueOnce({
      ...passengerUser,
      profile_photo_url: "https://letsgoride-backend.onrender.com/media/profile-photos/user/profile.jpg",
      profile_photo_name: "profile.jpg",
    });

    const screen = render(<EditProfileScreen />);

    expect(screen.getAllByText("TM").length).toBeGreaterThan(0);
    fireEvent.press(screen.getByRole("button", { name: "Update photo" }));

    await waitFor(() => {
      expect(uploadProfilePhoto).toHaveBeenCalledWith({
        uri: "file:///profile.jpg",
        fileName: "profile.jpg",
        mimeType: "image/jpeg",
      });
      expect(screen.getByText("Profile photo saved.")).toBeOnTheScreen();
    });
  });
});
