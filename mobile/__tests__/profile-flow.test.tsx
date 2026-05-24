import { fireEvent, render, waitFor } from "@testing-library/react-native";

import EditProfileScreen from "../app/(shared)/edit-profile";
import ProfileScreen from "../app/(shared)/profile";
import { updateCurrentUser } from "../services/authService";
import { User } from "../types/user.types";
import { passengerUser } from "./fixtures";

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
}));

describe("profile update flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser = passengerUser;
  });

  it("shows saved profile data, saves edits, and keeps updated fields visible", async () => {
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
    expect(summary.getByText("Hi, Tendai")).toBeOnTheScreen();
    expect(summary.getByText("+263771234567")).toBeOnTheScreen();
    fireEvent.press(summary.getByRole("button", { name: "Edit profile" }));
    expect(mockPush).toHaveBeenCalledWith("/(shared)/edit-profile");

    const screen = render(<EditProfileScreen />);
    expect(screen.getByDisplayValue("Tendai Moyo")).toBeOnTheScreen();
    expect(screen.getByDisplayValue("+263771234567")).toBeOnTheScreen();
    expect(screen.getByDisplayValue("Harare")).toBeOnTheScreen();

    fireEvent.changeText(screen.getByLabelText("Full name"), "Tendai Chipo");
    fireEvent.changeText(screen.getByLabelText("Phone number"), "+263779999999");
    fireEvent.changeText(screen.getByLabelText("City"), "Mutare");
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
      expect(screen.getByDisplayValue("Mutare")).toBeOnTheScreen();
      expect(screen.getByText("Profile saved.")).toBeOnTheScreen();
    });
    jest.runOnlyPendingTimers();
    expect(mockReplace).toHaveBeenCalledWith("/(shared)/profile");

    mockCurrentUser = updatedUser;
    screen.rerender(<EditProfileScreen />);

    expect(screen.getByDisplayValue("Tendai Chipo")).toBeOnTheScreen();
    expect(screen.queryByDisplayValue("")).not.toBeOnTheScreen();
    jest.useRealTimers();
  });

  it("stores profile photo metadata and keeps initials as fallback when no photo exists", async () => {
    (updateCurrentUser as jest.Mock).mockResolvedValueOnce({
      ...passengerUser,
      profile_photo_url: "file:///profile.jpg",
      profile_photo_name: "profile.jpg",
    });

    const screen = render(<EditProfileScreen />);

    expect(screen.getAllByText("TM").length).toBeGreaterThan(0);
    fireEvent.press(screen.getByRole("button", { name: "Update photo" }));

    await waitFor(() => {
      expect(updateCurrentUser).toHaveBeenCalledWith({
        profile_photo_url: "file:///profile.jpg",
        profile_photo_name: "profile.jpg",
      });
      expect(screen.getByText("Profile photo saved.")).toBeOnTheScreen();
    });
  });
});
