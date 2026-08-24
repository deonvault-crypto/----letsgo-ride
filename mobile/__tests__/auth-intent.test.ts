import {
  destinationAfterAuth,
  parseApplicationIntent,
  safeCustomerReturnTo,
} from "../utils/authIntent";

describe("authentication intent routing", () => {
  it("continues each worker application after a passenger authenticates", () => {
    expect(destinationAfterAuth("passenger", "courier_application")).toEqual({
      pathname: "/(shared)/worker-application",
      params: { product: "courier" },
    });
    expect(destinationAfterAuth("passenger", "driver_application")).toEqual({
      pathname: "/(shared)/worker-application",
      params: { product: "driver" },
    });
    expect(destinationAfterAuth("passenger", "merchant_application")).toEqual({
      pathname: "/(shared)/worker-application",
      params: { product: "merchant" },
    });
  });

  it("never lets an application intent cross an existing worker boundary", () => {
    expect(destinationAfterAuth("courier", "merchant_application")).toBe("/(courier)/home");
    expect(destinationAfterAuth("driver", "courier_application")).toBe("/(driver)/home");
    expect(destinationAfterAuth("admin", "driver_application")).toBe("/(admin)/dashboard");
  });

  it("rejects arbitrary return paths and unknown intents", () => {
    expect(parseApplicationIntent("admin_application")).toBe("customer_signup");
    expect(safeCustomerReturnTo("https://evil.example/phish")).toBeNull();
    expect(safeCustomerReturnTo("/(shared)/../../admin")).toBeNull();
    expect(safeCustomerReturnTo("/(shared)/courier-evil")).toBeNull();
    expect(safeCustomerReturnTo("/(shared)/courier?next=/(admin)/dashboard")).toBeNull();
    expect(safeCustomerReturnTo("/(shared)/food/checkout")).toBe("/(shared)/food/checkout");
  });
});
