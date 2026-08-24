import { isReliableCourierLocation } from "../services/locationService";

const base = {
  latitude: -17.824858,
  longitude: 31.053028,
  accuracy: 8,
  heading: 90,
  speed: 8,
  timestamp: 1_000_000,
};

describe("courier GPS quality", () => {
  it("accepts a realistic movement sample", () => {
    expect(isReliableCourierLocation({ ...base, longitude: 31.054, timestamp: 1_020_000 }, base)).toBe(true);
  });

  it("drops inaccurate, duplicate, and impossible jumps", () => {
    expect(isReliableCourierLocation({ ...base, accuracy: 180 })).toBe(false);
    expect(isReliableCourierLocation({ ...base, timestamp: 1_003_000 }, base)).toBe(false);
    expect(isReliableCourierLocation({ ...base, latitude: -17.7, timestamp: 1_003_000, speed: 0 }, base)).toBe(false);
  });
});
