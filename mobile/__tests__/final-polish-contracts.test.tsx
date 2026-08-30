import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react-native";

import { RideClassCar } from "../components/hailing/RideClassCar";
import { AppButton } from "../components/ui/AppButton";

function source(...segments: string[]) {
  return readFileSync(join(__dirname, "..", ...segments), "utf8");
}

describe("final 1-13 polish contracts", () => {
  it("renders owned decorative vehicle art for every Ride Now class without stock car glyphs", () => {
    const screen = render(<>
      <RideClassCar rideClass="ECONOMY" />
      <RideClassCar rideClass="COMFORT" />
      <RideClassCar rideClass="XL" />
    </>);
    const hidden = { includeHiddenElements: true };

    expect(screen.getByTestId("ride-class-car-economy", hidden)).toBeOnTheScreen();
    expect(screen.getByTestId("ride-class-car-comfort", hidden)).toBeOnTheScreen();
    expect(screen.getByTestId("ride-class-car-xl", hidden)).toBeOnTheScreen();
    expect(screen.queryByText("car-side", hidden)).toBeNull();
    expect(screen.queryByText("car-estate", hidden)).toBeNull();
    expect(screen.queryByText("van-passenger", hidden)).toBeNull();
  });

  it("keeps contextual button copy visible while work is in progress", () => {
    const screen = render(<AppButton title="Sending your ride request…" loading />);
    expect(screen.getByText("Sending your ride request…")).toBeOnTheScreen();
  });

  it("routes a SEARCHING Ride Now request straight back to the map-first searching screen", () => {
    const home = source("app", "(customer)", "home.tsx");
    expect(home).toContain('activeHailingTrip.status === "SEARCHING"');
    expect(home).toContain('/(customer)/hail/searching?tripId=');
  });

  it("keeps Food and Courier completion screens wired to the unified review flow", () => {
    const food = source("app", "(shared)", "food", "order", "[orderId].tsx");
    const courier = source("app", "(customer)", "courier", "[deliveryId].tsx");

    expect(food).toContain('title="Rate your order"');
    expect(food).toContain('pathname: "/(shared)/review"');
    expect(courier).toContain('"Rate your courier"');
    expect(courier).toContain('transactionType: "courier"');
    expect(courier).toContain('completed.food_order_id || completed.source_id');
  });

  it("exposes payout editing without ever prefilling a masked destination as a secret", () => {
    const wallet = source("app", "(shared)", "wallet.tsx");
    const finance = source("services", "workerFinanceService.ts");

    expect(wallet).toContain('accessibilityLabel="Edit payout method"');
    expect(wallet).toContain("updateWorkerPayoutMethod(editingMethod.id");
    expect(wallet).toContain('setMobile("")');
    expect(wallet).toContain('setAccount("")');
    expect(wallet).not.toContain("setMobile(method.masked_reference");
    expect(wallet).not.toContain("setAccount(method.masked_reference");
    expect(finance).toContain("PayoutMethodUpdateInput");
  });
});
