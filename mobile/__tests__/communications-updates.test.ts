import * as Updates from "expo-updates";
import { downloadCompatibleUpdate, isNewerVersion, STORE_URLS } from "../services/appUpdateService";
import { announcementAction, announcementExpired } from "../services/announcementService";
import { resolveNotificationRoute } from "../services/notificationRouting";

jest.mock("expo-updates", () => ({ isEnabled: true, checkForUpdateAsync: jest.fn(), fetchUpdateAsync: jest.fn(), reloadAsync: jest.fn() }));

describe("Communications and safe app updates", () => {
  beforeEach(() => jest.clearAllMocks());
  it("downloads once for concurrent taps and never reloads current activity", async () => {
    (Updates.checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: true });
    (Updates.fetchUpdateAsync as jest.Mock).mockResolvedValue({ isNew: true });
    const first = downloadCompatibleUpdate(), second = downloadCompatibleUpdate();
    expect(first).toBe(second);
    await expect(first).resolves.toBe("ready");
    expect(Updates.fetchUpdateAsync).toHaveBeenCalledTimes(1);
    expect(Updates.reloadAsync).not.toHaveBeenCalled();
  });
  it("retains current app on download failure and allows retry", async () => {
    (Updates.checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: true });
    (Updates.fetchUpdateAsync as jest.Mock).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ isNew: true });
    await expect(downloadCompatibleUpdate()).rejects.toThrow("offline");
    await expect(downloadCompatibleUpdate()).resolves.toBe("ready");
    expect(Updates.reloadAsync).not.toHaveBeenCalled();
  });
  it("does not fetch when there is no compatible update", async () => {
    (Updates.checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: false });
    await expect(downloadCompatibleUpdate()).resolves.toBe("current");
    expect(Updates.fetchUpdateAsync).not.toHaveBeenCalled();
  });
  it("compares release numbers numerically without downgrading newer test builds", () => {
    expect(isNewerVersion("2.0.10", "2.0.9")).toBe(true);
    expect(isNewerVersion("2.0.2", "2.0.3")).toBe(false);
    expect(isNewerVersion("2.0.3", "2.0.3")).toBe(false);
    expect(isNewerVersion("latest", "2.0.3")).toBe(false);
    expect(STORE_URLS.ios).toBe("https://apps.apple.com/app/id6772862281");
  });
  it("rejects arbitrary navigation and enforces role-specific actions", () => {
    expect(announcementAction("https://evil.invalid", "passenger")).toBeNull();
    expect(announcementAction("ride", "driver")).toBeNull();
    expect(announcementAction("food", "passenger")?.route).toBe("/(customer)/food");
    expect(resolveNotificationRoute({ data: { notification_target: "announcement", notification_id: "../../admin" }, role: "passenger" })).toBeNull();
    expect(resolveNotificationRoute({ data: { notification_target: "announcement", notification_id: "abc-123" }, role: "passenger" })).toBe("/(shared)/announcement/abc-123");
  });
  it("fails closed for expired or invalid expiry data", () => {
    expect(announcementExpired({ expires_at: "2026-09-03T12:00:00Z" }, Date.parse("2026-09-03T12:00:00Z"))).toBe(true);
    expect(announcementExpired({ expires_at: "invalid" })).toBe(true);
    expect(announcementExpired({ expired: true })).toBe(true);
    expect(announcementExpired({})).toBe(false);
  });
});
