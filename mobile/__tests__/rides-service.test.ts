import { createRide, requestSeat, searchRides } from "../services/ridesService";
import { ride, rideRequest } from "./fixtures";

const mockRequestData = jest.fn();

jest.mock("../services/api", () => ({
  requestData: (...args: unknown[]) => mockRequestData(...args),
}));

describe("rides service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("sends route, date, and seat filters to the backend search endpoint", async () => {
    mockRequestData.mockResolvedValueOnce([ride]);

    await searchRides({
      origin: "Harare",
      destination: "Bulawayo",
      date: "2026-06-03",
      seats: 1,
    });

    expect(mockRequestData).toHaveBeenCalledWith({
      method: "GET",
      url: "/rides/search",
      params: {
        origin: "Harare",
        destination: "Bulawayo",
        date: "2026-06-03",
        seats: 1,
      },
    });
  });

  it("sends passenger booking requests to the backend", async () => {
    mockRequestData.mockResolvedValueOnce(rideRequest);

    await requestSeat({
      ride_id: "ride-1",
      passenger_name: "Tendai Moyo",
      passenger_phone: "+263771234567",
      passenger_note: "Small bag only",
      seats: 1,
    });

    expect(mockRequestData).toHaveBeenCalledWith({
      method: "POST",
      url: "/requests",
      data: {
        ride_id: "ride-1",
        passenger_name: "Tendai Moyo",
        passenger_phone: "+263771234567",
        passenger_note: "Small bag only",
        seats: 1,
      },
    });
  });

  it("posts verified driver trips to the backend", async () => {
    mockRequestData.mockResolvedValueOnce(ride);

    await createRide({
      origin: "Harare",
      destination: "Bulawayo",
      date: "2026-06-03",
      time: "07:30",
      available_seats: 3,
      price_usd: 12,
      vehicle: "Example sedan, grey",
    });

    expect(mockRequestData).toHaveBeenCalledWith({
      method: "POST",
      url: "/rides",
      data: expect.objectContaining({
        origin: "Harare",
        destination: "Bulawayo",
        date: "2026-06-03",
      }),
    });
  });
});
