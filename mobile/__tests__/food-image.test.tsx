import { fireEvent, render } from "@testing-library/react-native";
import { Image, StyleSheet } from "react-native";

import { FoodImage } from "../components/food/FoodImage";

describe("FoodImage", () => {
  it("uses a dedicated owned editorial asset only for the landing hero", () => {
    const screen = render(<FoodImage role="landing" label="Food landing" />);
    const image = screen.getByTestId("food-image-landing-owned");
    expect(image).toBeOnTheScreen();
    expect(StyleSheet.flatten(image.props.style)).toMatchObject({ position: "absolute", width: "100%", height: "100%" });
    expect(screen.queryByTestId("food-image-kitchen-owned")).toBeNull();
  });

  it("uses the distinct LetsGoRide Kitchen cover for its restaurant role", () => {
    const screen = render(<FoodImage role="restaurant" label="LetsGoRide Kitchen" />);
    expect(screen.getByTestId("food-image-kitchen-owned")).toBeOnTheScreen();
    expect(screen.queryByTestId("food-image-landing-owned")).toBeNull();
  });

  it("never reuses the landing hero when a restaurant image fails", () => {
    const screen = render(<FoodImage uri="https://example.invalid/restaurant.jpg" role="restaurant" label="Independent Restaurant" />);
    fireEvent(screen.UNSAFE_getByType(Image), "error");
    expect(screen.getByTestId("food-image-neutral-fallback")).toBeOnTheScreen();
    expect(screen.queryByTestId("food-image-landing-owned")).toBeNull();
    expect(screen.queryByTestId("food-image-kitchen-owned")).toBeNull();
  });

  it("gives missing menu item imagery a deliberate neutral treatment", () => {
    const screen = render(<FoodImage role="menu-item" label="Grilled chicken" />);
    expect(screen.getByTestId("food-image-neutral-fallback")).toBeOnTheScreen();
    expect(screen.queryByTestId("food-image-landing-owned")).toBeNull();
  });
});
