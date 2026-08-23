import { decodePolyline } from "../utils/decodePolyline";
import { displayDeliveryReference, displayPlace } from "../utils/displayText";

describe("courier route rendering", () => {
  it("decodes provider route geometry for the delivery map", () => {
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([
      { latitude: 38.5, longitude: -120.2 },
      { latitude: 40.7, longitude: -120.95 },
      { latitude: 43.252, longitude: -126.453 },
    ]);
  });

  it("treats absent geometry as an empty route", () => {
    expect(decodePolyline(null)).toEqual([]);
  });

  it("normalizes human-facing places and short delivery references", () => {
    expect(displayPlace("joina city,harare")).toBe("Joina City, Harare");
    expect(displayPlace("Sam Levy's Village")).toBe("Sam Levy's Village");
    expect(displayDeliveryReference("54ec3842-dffc")).toBe("Delivery #54EC3842");
  });
});
