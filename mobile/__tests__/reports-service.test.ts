import { createReport, myReports } from "../services/reportsService";

const mockRequestData = jest.fn();

jest.mock("../services/api", () => ({
  requestData: (...args: unknown[]) => mockRequestData(...args),
}));

describe("safety reports service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("preserves report creation and bounds current history reads", async () => {
    mockRequestData.mockResolvedValueOnce({ id: "report-1" });
    mockRequestData.mockResolvedValueOnce([]);

    await createReport({ report_type: "safety", message: "Please review this incident." });
    await myReports();

    expect(mockRequestData).toHaveBeenNthCalledWith(1, {
      method: "POST",
      url: "/reports",
      data: { report_type: "safety", message: "Please review this incident." },
    });
    expect(mockRequestData).toHaveBeenNthCalledWith(2, {
      method: "GET",
      url: "/reports/my?limit=100",
    });
  });
});
