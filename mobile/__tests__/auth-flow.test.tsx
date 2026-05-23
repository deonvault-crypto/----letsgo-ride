import { fireEvent, render, waitFor } from "@testing-library/react-native";

import EmailLoginScreen from "../app/(auth)/email-login";
import { emailLogin } from "../services/authService";
import { passengerUser } from "./fixtures";

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useLocalSearchParams: () => ({}),
  usePathname: () => "/email-login",
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require("react");
    React.useEffect(() => callback(), [callback]);
  },
}));

jest.mock("../services/authService", () => ({
  emailLogin: jest.fn(),
}));

describe("email login flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("accepts credentials, sends login request, stores session through auth service, and opens passenger home", async () => {
    (emailLogin as jest.Mock).mockResolvedValueOnce({
      token: "token-1",
      user: passengerUser,
    });

    const screen = render(<EmailLoginScreen />);

    fireEvent.changeText(screen.getByLabelText("Email"), "tendai@example.com");
    fireEvent.changeText(screen.getByLabelText("Password"), "securepass");
    fireEvent.press(screen.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(emailLogin).toHaveBeenCalledWith("tendai@example.com", "securepass");
      expect(mockReplace).toHaveBeenCalledWith("/(passenger)/home");
    });
  });

  it("shows a clear error when login fails", async () => {
    (emailLogin as jest.Mock).mockRejectedValueOnce(new Error("Invalid email or password."));

    const screen = render(<EmailLoginScreen />);

    fireEvent.changeText(screen.getByLabelText("Email"), "wrong@example.com");
    fireEvent.changeText(screen.getByLabelText("Password"), "wrongpass");
    fireEvent.press(screen.getByRole("button", { name: "Login" }));

    expect(await screen.findByText("Invalid email or password.")).toBeOnTheScreen();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
