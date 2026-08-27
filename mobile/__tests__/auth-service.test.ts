import * as SecureStore from "expo-secure-store";

import { deleteAccount, emailLogin, logoutToGuest, updateCurrentUser } from "../services/authService";
import { passengerUser } from "./fixtures";

const mockRequestData = jest.fn();
const mockSaveToken = jest.fn();
const mockDisablePhoneNotifications = jest.fn(async () => undefined);

jest.mock("../services/api", () => ({
  requestData: (...args: unknown[]) => mockRequestData(...args),
  saveToken: (...args: unknown[]) => mockSaveToken(...args),
  clearToken: jest.fn(),
  getToken: jest.fn(),
}));

jest.mock("../services/pushNotificationService", () => ({
  disablePhoneNotifications: () => mockDisablePhoneNotifications(),
}));

describe("auth service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequestData.mockResolvedValue(undefined);
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

    expect(mockRequestData).toHaveBeenCalledWith({ method: "POST", url: "/auth/logout" });
    expect(router.replace).toHaveBeenCalledWith("/(customer)/home");
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("letsgoride.auth.token");
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("letsgoride.biometric.token");
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("letsgoride.merchant.selected_restaurant");
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("letsgo_ride_location_memory_v1");
  });

  it("deletes server truth before clearing private device state", async () => {
    mockRequestData.mockResolvedValueOnce({ deleted: true });

    await expect(deleteAccount()).resolves.toEqual({ deleted: true });

    expect(mockRequestData).toHaveBeenCalledWith({ method: "DELETE", url: "/auth/me" });
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("letsgoride.auth.token");
  });

  it("confirms a profile mutation with an authoritative read before publishing success", async () => {
    const confirmed = { ...passengerUser, phone: "+263779999999" };
    mockRequestData
      .mockResolvedValueOnce({ ...passengerUser, phone: "+263779999999" })
      .mockResolvedValueOnce(confirmed);

    await expect(updateCurrentUser({ phone: "+263779999999" })).resolves.toEqual(confirmed);

    expect(mockRequestData).toHaveBeenNthCalledWith(1, {
      method: "PATCH",
      url: "/auth/me",
      data: { phone: "+263779999999" },
    });
    expect(mockRequestData).toHaveBeenNthCalledWith(2, { method: "GET", url: "/auth/me" });
  });
});
