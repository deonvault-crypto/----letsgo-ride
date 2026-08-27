import { Alert } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import {
  AccountComplianceSections,
  PublicAccountProduct,
} from "../components/account/AccountComplianceSections";
import { legalUrls } from "../constants/legal";
import { deleteAccount, logoutToGuest } from "../services/authService";
import { disableBiometricLogin } from "../services/biometricService";
import { openExternalUrl } from "../utils/openExternalUrl";

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

jest.mock("../services/authService", () => ({
  deleteAccount: jest.fn(async () => ({ deleted: true })),
  logoutToGuest: jest.fn(async () => undefined),
}));

jest.mock("../services/biometricService", () => ({
  disableBiometricLogin: jest.fn(async () => undefined),
}));

jest.mock("../utils/openExternalUrl", () => ({
  openExternalUrl: jest.fn(async () => undefined),
}));

const products: PublicAccountProduct[] = ["customer", "driver", "courier", "merchant"];

describe("account legal and deletion controls", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each(products)("exposes every required control for the %s account", (product) => {
    const screen = render(<AccountComplianceSections product={product} />);

    expect(screen.getByText("Legal & support")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Privacy Policy" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Terms of Service" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Safety" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Help & Support" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Delete Account" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Sign Out" })).toBeOnTheScreen();

    fireEvent.press(screen.getByRole("button", { name: "Help & Support" }));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/(shared)/support",
      params: { product },
    });
  });

  it("opens only the canonical public legal URLs", () => {
    const screen = render(<AccountComplianceSections product="customer" />);

    fireEvent.press(screen.getByRole("button", { name: "Privacy Policy" }));
    fireEvent.press(screen.getByRole("button", { name: "Terms of Service" }));
    fireEvent.press(screen.getByRole("button", { name: "Safety" }));

    expect(openExternalUrl).toHaveBeenNthCalledWith(1, legalUrls.privacy);
    expect(openExternalUrl).toHaveBeenNthCalledWith(2, legalUrls.terms);
    expect(openExternalUrl).toHaveBeenNthCalledWith(3, legalUrls.safety);
    expect(legalUrls.deletion).toBe("https://letsgoride.site/delete-account");
  });

  it("requires an explicit typed confirmation before authenticated self-deletion", async () => {
    const screen = render(<AccountComplianceSections product="driver" />);

    fireEvent.press(screen.getByRole("button", { name: "Delete Account" }));
    expect(screen.getByText("Delete account?")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Delete account" })).toBeDisabled();
    expect(deleteAccount).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByLabelText("Type DELETE to confirm account deletion"), "DELETE");
    fireEvent.press(screen.getByRole("button", { name: "Delete account" }));

    await waitFor(() => {
      expect(deleteAccount).toHaveBeenCalledTimes(1);
      expect(disableBiometricLogin).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith("/(customer)/home");
    });
  });

  it("signs out only after native confirmation", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
      void buttons?.find((button) => button.text === "Sign out")?.onPress?.();
    });
    const screen = render(<AccountComplianceSections product="merchant" />);

    fireEvent.press(screen.getByRole("button", { name: "Sign Out" }));

    await waitFor(() => expect(logoutToGuest).toHaveBeenCalledTimes(1));
    alert.mockRestore();
  });
});
