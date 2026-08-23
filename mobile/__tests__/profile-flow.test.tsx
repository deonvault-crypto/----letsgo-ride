import { fireEvent, render, waitFor } from "@testing-library/react-native";

import EditProfileScreen from "../app/(shared)/edit-profile";
import ProfileScreen from "../app/(shared)/profile";
import { updateCurrentUser, uploadProfilePhoto } from "../services/authService";
import { getMyVerification } from "../services/verificationService";
import { User } from "../types/user.types";
import { driverUser, notStartedProfile, passengerUser, pendingProfile, verifiedProfile } from "./fixtures";

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
    isGuest: !mockCurrentUser,
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

  it("shows the customer account summary, saves edits, and keeps updated fields visible", async () => {
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
    expect(summary.getByText("CUSTOMER ACCOUNT")).toBeOnTheScreen();
    expect(summary.getByText("Identity verification")).toBeOnTheScreen();
    expect(summary.queryByText("Driver verification")).toBeNull();
    expect(summary.getByText("Customer stays customer.")).toBeOnTheScreen();
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

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(shared)/profile");
    }, { timeout: 2000 });

    mockCurrentUser = updatedUser;
    screen.rerender(<EditProfileScreen />);

    expect(screen.getByDisplayValue("Tendai Chipo")).toBeOnTheScreen();
    expect(screen.getByText("Mutare")).toBeOnTheScreen();
    expect(screen.queryByDisplayValue("")).not.toBeOnTheScreen();
  });

  it("shows driver verification under review only for a Driver account", async () => {
    mockCurrentUser = driverUser;
    (getMyVerification as jest.Mock).mockResolvedValueOnce(pendingProfile);

    const screen = render(<ProfileScreen />);

    await waitFor(() => {
      expect(screen.getByText("DRIVER ACCOUNT")).toBeOnTheScreen();
      expect(screen.getByText("Driver verification")).toBeOnTheScreen();
      expect(screen.getByText("Verification under review")).toBeOnTheScreen();
    });
  });

  it("uses clear approved driver verification wording for a Driver account", async () => {
    mockCurrentUser = driverUser;
    (getMyVerification as jest.Mock).mockResolvedValueOnce(verifiedProfile);

    const screen = render(<ProfileScreen />);

    await waitFor(() => {
      expect(screen.getByText("Driver verification")).toBeOnTheScreen();
      expect(screen.getByText("Driver verification approved")).toBeOnTheScreen();
      expect(screen.getByText("Driver stays driver.")).toBeOnTheScreen();
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
