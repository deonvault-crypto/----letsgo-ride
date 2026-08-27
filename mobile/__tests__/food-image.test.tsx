import { fireEvent, render } from "@testing-library/react-native";
import { Image, StyleSheet } from "react-native";

import { FoodImage } from "../components/food/FoodImage";
import { officialDirectoryLogos } from "../constants/foodDirectoryAssets";

describe("FoodImage", () => {
  it("uses a dedicated owned editorial asset only for the landing hero", () => {
    const screen = render(<FoodImage role="landing" label="Food landing" />);
    const image = screen.getByTestId("food-image-landing-owned");
    expect(image).toBeOnTheScreen();
    expect(image).toHaveProp("resizeMethod", "resize");
    expect(StyleSheet.flatten(image.props.style)).toMatchObject({ position: "absolute", width: "100%", height: "100%" });
    expect(screen.queryByTestId("food-image-kitchen-owned")).toBeNull();
  });

  it("uses the distinct LetsGoRide Kitchen cover for its restaurant role", () => {
    const screen = render(<FoodImage role="restaurant" label="LetsGoRide Kitchen" />);
    expect(screen.getByTestId("food-image-kitchen-owned")).toBeOnTheScreen();
    expect(screen.queryByTestId("food-image-landing-owned")).toBeNull();
  });

  it("never reuses the landing hero when a restaurant image fails", () => {
    const screen = render(<FoodImage uri="https://example.invalid/restaurant.jpg" role="restaurant" label="KFC Zimbabwe" />);
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

  it("renders an audited restaurant logo with contain sizing", () => {
    const screen = render(<FoodImage uri="https://official.example/logo.png" role="logo" label="Restaurant logo" />);
    const logo = screen.getByTestId("food-image-remote-logo");
    expect(logo).toHaveProp("resizeMode", "contain");
    expect(logo).toHaveProp("resizeMethod", "resize");
    expect(StyleSheet.flatten(logo.props.style)).toMatchObject({ top: 12, right: 10, bottom: 12, left: 10 });
  });

  it("uses a generic icon without generated brand initials when a logo is missing", () => {
    const screen = render(<FoodImage role="logo" label="Chicken Inn Zimbabwe logo" />);
    expect(screen.getByTestId("food-image-neutral-fallback")).toBeOnTheScreen();
    expect(screen.queryByText("CI")).toBeNull();
    expect(screen.queryByText("Chicken Inn Zimbabwe logo")).toBeNull();
  });

  it.each([
    "directory-kfc-zimbabwe",
    "directory-chicken-inn-zimbabwe",
    "directory-pizza-inn-zimbabwe",
    "directory-bakers-inn-zimbabwe",
  ])("bundles the verified official logo for %s", (restaurantId) => {
    const asset = officialDirectoryLogos[restaurantId];
    const screen = render(<FoodImage source={asset.image} role="logo" label="Official restaurant logo" />);
    expect(screen.getByTestId("food-image-official-logo")).toHaveProp("resizeMode", "contain");
    expect(screen.queryByTestId("food-image-neutral-fallback")).toBeNull();
  });
});
