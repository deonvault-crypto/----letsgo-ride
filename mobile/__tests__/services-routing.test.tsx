import { fireEvent, render } from "@testing-library/react-native";

import ServicesScreen from "../app/(shared)/services";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/services",
}));

describe("consolidated Ride service routing", () => {
  it("opens one Ride search for local intent and planned city-to-city trips", () => {
    const screen = render(<ServicesScreen />);
    fireEvent.press(screen.getByText("Rides"));
    expect(mockPush).toHaveBeenCalledWith("/(customer)/search");
    expect(screen.getByText("Search local intent and planned city-to-city trips in one place")).toBeOnTheScreen();
  });
});
