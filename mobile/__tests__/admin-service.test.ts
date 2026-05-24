import {
  getAdminOverview,
  listAdminRequests,
  listAdminRides,
  listAdminUsers,
  updateAdminRequestStatus,
  updateAdminUserStatus,
} from "../services/adminService";

const mockRequestData = jest.fn();

jest.mock("../services/api", () => ({
  requestData: (...args: unknown[]) => mockRequestData(...args),
  getToken: jest.fn(),
}));

describe("admin operations service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("loads operations overview with real backend endpoint", async () => {
    mockRequestData.mockResolvedValueOnce({
      total_users: 4,
      active_rides: 2,
      pending_ride_requests: 1,
      recent_activity: [],
    });

    const overview = await getAdminOverview();

    expect(overview.total_users).toBe(4);
    expect(mockRequestData).toHaveBeenCalledWith({ method: "GET", url: "/admin/overview" });
  });

  it("sends admin list filters to backend", async () => {
    mockRequestData.mockResolvedValue({ count: 0, items: [] });

    await listAdminUsers({ search: "tendai", role: "driver", verification: "verified" });
    await listAdminRides({ search: "Harare", filter: "pending_requests" });
    await listAdminRequests({ status: "pending" });

    expect(mockRequestData).toHaveBeenNthCalledWith(1, {
      method: "GET",
      url: "/admin/users",
      params: { search: "tendai", role: "driver", verification: "verified" },
    });
    expect(mockRequestData).toHaveBeenNthCalledWith(2, {
      method: "GET",
      url: "/admin/rides",
      params: { search: "Harare", filter: "pending_requests" },
    });
    expect(mockRequestData).toHaveBeenNthCalledWith(3, {
      method: "GET",
      url: "/admin/requests",
      params: { status: "pending" },
    });
  });

  it("uses admin override actions instead of normal driver approval", async () => {
    mockRequestData.mockResolvedValueOnce({ id: "request-1", status: "cancelled_by_admin" });

    await updateAdminRequestStatus("request-1", "cancelled_by_admin", "Safety intervention");

    expect(mockRequestData).toHaveBeenCalledWith({
      method: "PATCH",
      url: "/admin/requests/request-1/status",
      data: { status: "cancelled_by_admin", reason: "Safety intervention" },
    });
  });

  it("requires reason-capable user status changes", async () => {
    mockRequestData.mockResolvedValueOnce({ id: "user-1", status: "suspended" });

    await updateAdminUserStatus("user-1", "suspended", "Safety review");

    expect(mockRequestData).toHaveBeenCalledWith({
      method: "PATCH",
      url: "/admin/users/user-1/status",
      params: { status: "suspended", reason: "Safety review" },
    });
  });
});
