import * as SecureStore from "expo-secure-store";

import { emailLogin, logoutToGuest } from "../services/authService";
import { passengerUser } from "./fixtures";

const mockRequestData = jest.fn();
const mockSaveToken = jest.fn();

jest.mock("../services/api", () => ({
  requestData: (...args: unknown[]) => mockRequestData(...args),
  saveToken: (...args: unknown[]) => mockSaveToken(...args),
  clearToken: jest.fn(),
  getToken: jest.fn(),
}));

describe("auth service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("stores the returned session token after email login", async () => {
    mockRequestData.mockResolvedValueOnce({ token: "session-token", user: passengerUser });

    const result = await emailLogin("tendai@example.com", "securepass");

    expect(mockRequestData).toHaveBeenCalledWith({
      method: "POST",
      url: "/auth/email-login",
      data: { email: "tendai@example.com", password: "securepass" },
    });
    expect(mockSaveToken).toHaveBeenCalledWith("session-token");
    expect(result.user.name).toBe("Tendai Moyo");
  });

  it("clears private account state and routes every logout into guest browsing", async () => {
    const router = { replace: jest.fn() };

    await logoutToGuest(router);

    expect(router.replace).toHaveBeenCalledWith("/(customer)/home");
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("letsgoride.auth.token");
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("letsgoride.biometric.token");
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("letsgoride.merchant.selected_restaurant");
  });
});
