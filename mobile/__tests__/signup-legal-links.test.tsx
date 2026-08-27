import { fireEvent, render } from "@testing-library/react-native";

import EmailRegisterScreen from "../app/(auth)/email-register";
import { legalUrls } from "../constants/legal";
import { openExternalUrl } from "../utils/openExternalUrl";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
  usePathname: () => "/email-register",
}));

jest.mock("../services/authService", () => ({
  emailRegister: jest.fn(),
  resendEmailVerification: jest.fn(),
}));

jest.mock("../utils/openExternalUrl", () => ({
  openExternalUrl: jest.fn(async () => undefined),
}));

describe("signup legal access", () => {
  it("keeps Privacy and Terms reachable before account creation", () => {
    const screen = render(<EmailRegisterScreen />);

    fireEvent.press(screen.getByRole("link", { name: "Terms of Service" }));
    fireEvent.press(screen.getByRole("link", { name: "Privacy Policy" }));

    expect(openExternalUrl).toHaveBeenNthCalledWith(1, legalUrls.terms);
    expect(openExternalUrl).toHaveBeenNthCalledWith(2, legalUrls.privacy);
  });
});
