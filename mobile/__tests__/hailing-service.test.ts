import {
  createHailingQuote,
  getActiveHailingTrip,
  getHailingConfig,
  regenerateHailingTripPin,
  requestHailingTrip,
} from "../services/hailingService";

const mockRequestData = jest.fn();

jest.mock("../services/api", () => ({
  requestData: (...args: unknown[]) => mockRequestData(...args),
}));

describe("hailing service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("reads the backend feature flag instead of hard-coding Ride Now availability", async () => {
    mockRequestData.mockResolvedValueOnce({ enabled: false, ride_classes: [] });

    await getHailingConfig();

    expect(mockRequestData).toHaveBeenCalledWith({ method: "GET", url: "/hailing/config" });
  });

  it("asks the backend for authoritative hailing quotes", async () => {
    mockRequestData.mockResolvedValueOnce({ quote_id: "quote-1" });

    await createHailingQuote({
      ride_class: "ECONOMY",
      pickup: { formatted_address: "Harare", latitude: -17.82, longitude: 31.05 },
      dropoff: { formatted_address: "Avondale", latitude: -17.8, longitude: 31.04 },
    });

    expect(mockRequestData).toHaveBeenCalledWith({
      method: "POST",
      url: "/hailing/quotes",
      data: expect.objectContaining({ ride_class: "ECONOMY" }),
    });
  });

  it("creates trips from quote ids without sending client fares", async () => {
    mockRequestData.mockResolvedValueOnce({ id: "trip-1" });

    await requestHailingTrip({ quote_id: "quote-1", payment_method: "cash", client_request_id: "once" });

    expect(mockRequestData).toHaveBeenCalledWith({
      method: "POST",
      url: "/hailing/trips",
      data: { quote_id: "quote-1", payment_method: "cash", client_request_id: "once" },
    });
  });

  it("restores active trips from server truth", async () => {
    mockRequestData.mockResolvedValueOnce(null);

    await getActiveHailingTrip();

    expect(mockRequestData).toHaveBeenCalledWith({ method: "GET", url: "/hailing/trips/active" });
  });

  it("regenerates an optional hailing PIN through the passenger-only endpoint", async () => {
    mockRequestData.mockResolvedValueOnce({ id: "trip-1", trip_pin: "123456" });

    await regenerateHailingTripPin("trip-1");

    expect(mockRequestData).toHaveBeenCalledWith({
      method: "POST",
      url: "/hailing/trips/trip-1/regenerate-pin",
    });
  });
});
