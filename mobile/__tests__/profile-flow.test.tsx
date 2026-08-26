import { fireEvent, render, waitFor } from "@testing-library/react-native";

import EditProfileScreen from "../app/(shared)/edit-profile";
import ProfileScreen from "../app/(shared)/profile";
import { updateCurrentUser, uploadProfilePhoto } from "../services/authService";
import { getMyVerification } from "../services/verificationService";
import { listMyWorkerApplications } from "../services/operationsService";
import { User } from "../types/user.types";
import { driverUser, notStartedProfile, passengerUser, pendingProfile, verifiedProfile } from "./fixtures";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockReload = jest.fn();
let mockCurrentUser: User | null = passengerUser;

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useLocalSearchParams: () => ({ mode: "edit" }),
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

jest.mock("../services/operationsService", () => ({
  listMyWorkerApplications: jest.fn(async () => []),
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
      name: "Tendai Moyo",
      pending_email: "new-email@example.com",
      phone: "+263779999999",
      city: "Mutare",
      bio: "Travels between Harare and Mutare",
      travel_preferences: "Quiet morning trips",
    };
    (updateCurrentUser as jest.Mock).mockResolvedValueOnce(updatedUser);

    const summary = render(<ProfileScreen />);
    expect(summary.getAllByText("Tendai Moyo").length).toBeGreaterThan(0);
    expect(summary.getAllByText("Harare").length).toBeGreaterThan(0);
    expect(summary.getByText("Customer")).toBeOnTheScreen();
    expect(summary.queryByText("Driver verification")).toBeNull();
    expect(summary.queryByText(/stays customer/i)).toBeNull();
    fireEvent.press(summary.getByRole("button", { name: "Settings" }));
    expect(mockPush).toHaveBeenCalledWith("/(shared)/settings");
    summary.unmount();

    const screen = render(<EditProfileScreen />);
    expect(screen.getAllByText("Tendai Moyo").length).toBeGreaterThan(0);
    expect(screen.getByText("Contact LetsGoRide Support to change your legal name.")).toBeOnTheScreen();
    expect(screen.queryByLabelText("Full name")).toBeNull();
    expect(screen.getByDisplayValue("+263771234567")).toBeOnTheScreen();
    expect(screen.getByText("Harare")).toBeOnTheScreen();

    fireEvent.changeText(screen.getByLabelText("Email"), "new-email@example.com");
    fireEvent.changeText(screen.getByLabelText("Phone number"), "+263779999999");
    fireEvent.press(screen.getByRole("button", { name: "City" }));
    fireEvent.changeText(screen.getByPlaceholderText("Search or type a location"), "Mutare");
    fireEvent.press(screen.getByText("Mutare"));
    fireEvent.changeText(screen.getByLabelText("About"), "Travels between Harare and Mutare");
    fireEvent.changeText(screen.getByLabelText("Preferences"), "Quiet morning trips");
    fireEvent.press(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateCurrentUser).toHaveBeenCalledWith(expect.objectContaining({
        email: "new-email@example.com",
        phone: "+263779999999",
        city: "Mutare",
        bio: "Travels between Harare and Mutare",
        travel_preferences: "Quiet morning trips",
      }));
      expect(updateCurrentUser).not.toHaveBeenCalledWith(expect.objectContaining({ name: expect.anything() }));
      expect(screen.getByTestId("saved-account-summary")).toBeOnTheScreen();
      expect(screen.getByText("Changes saved")).toBeOnTheScreen();
      expect(screen.getByText(passengerUser.email!)).toBeOnTheScreen();
      expect(screen.getByText("Your current verified email stays active until you verify the new address.")).toBeOnTheScreen();
      expect(screen.getByRole("button", { name: "Verify new email" })).toBeOnTheScreen();
    });

    expect(mockReplace).not.toHaveBeenCalled();

    mockCurrentUser = updatedUser;
    screen.rerender(<EditProfileScreen />);

    expect(screen.getAllByText("Tendai Moyo").length).toBeGreaterThan(0);
    expect(screen.getByText("Mutare")).toBeOnTheScreen();
  }, 15000);

  it("keeps approved workforce profiles in support-only summaries after reopen", async () => {
    for (const product of ["driver", "courier", "merchant"] as const) {
      mockCurrentUser = { ...driverUser, id: `${product}-user`, role: product, verification_status: "approved" };
      (listMyWorkerApplications as jest.Mock).mockResolvedValueOnce([{
        id: `application-${product}`,
        user_id: `${product}-user`,
        product,
        full_name: `Saved ${product}`,
        phone: "+263771111111",
        service_area: "Harare",
        service_area_id: "harare",
        accepted_terms: true,
        status: "APPROVED",
        documents: [],
        required_document_types: [],
        missing_document_types: [],
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z",
      }]);

      const screen = render(<EditProfileScreen />);
      expect(await screen.findByTestId("saved-account-summary")).toBeOnTheScreen();
      expect(screen.queryByLabelText("Email")).toBeNull();
      expect(screen.queryByLabelText("Phone number")).toBeNull();
      fireEvent.press(screen.getByRole("button", { name: "Request a change" }));
      expect(mockPush).toHaveBeenLastCalledWith({
        pathname: "/(shared)/support",
        params: { subject: "Account details change", product },
      });
      screen.unmount();
    }
  });

  it("shows driver verification under review only for a Driver account", async () => {
    mockCurrentUser = { ...driverUser, verification_status: pendingProfile.verification_status };

    const screen = render(<ProfileScreen />);

    await waitFor(() => {
      expect(screen.getByText("Driver")).toBeOnTheScreen();
      expect(screen.getAllByText("Driver verification").length).toBeGreaterThan(0);
      expect(screen.getByText("Verification under review")).toBeOnTheScreen();
    });
  });

  it("uses clear approved driver verification wording for a Driver account", async () => {
    mockCurrentUser = { ...driverUser, verification_status: verifiedProfile.verification_status };

    const screen = render(<ProfileScreen />);

    await waitFor(() => {
      expect(screen.getAllByText("Driver verification").length).toBeGreaterThan(0);
      expect(screen.getByText("Driver verification approved")).toBeOnTheScreen();
      expect(screen.queryByText(/stays driver/i)).toBeNull();
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
    fireEvent.press(screen.getByRole("button", { name: "Update profile photo" }));

    await waitFor(() => {
      expect(uploadProfilePhoto).toHaveBeenCalledWith({
        uri: "file:///profile.jpg",
        fileName: "profile.jpg",
        mimeType: "image/jpeg",
      });
      expect(screen.getByText("Profile photo saved")).toBeOnTheScreen();
    });
  });
});
