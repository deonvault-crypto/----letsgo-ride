import { fireEvent, render } from "@testing-library/react-native";
import { Image } from "react-native";

import { FoodImage } from "../components/food/FoodImage";

describe("FoodImage", () => {
  it("falls back to owned food media when a live restaurant image fails", () => {
    const screen = render(<FoodImage uri="https://example.invalid/dish.jpg" photographicFallback label="Dish" />);
    fireEvent(screen.UNSAFE_getByType(Image), "error");
    expect(screen.getByTestId("food-image-owned-fallback")).toBeOnTheScreen();
  });

  it("keeps unavailable brands on a neutral treatment", () => {
    const screen = render(<FoodImage label="Unavailable restaurant" />);
    expect(screen.getByTestId("food-image-neutral-fallback")).toBeOnTheScreen();
    expect(screen.queryByTestId("food-image-owned-fallback")).toBeNull();
  });
});
