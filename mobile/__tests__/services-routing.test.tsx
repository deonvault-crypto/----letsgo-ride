import { fireEvent, render } from "@testing-library/react-native";

import ServicesScreen from "../app/(shared)/services";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/services",
}));

describe("consolidated Ride service routing", () => {
  it("opens Ride Now destination picker without an intercity doorway", () => {
    const screen = render(<ServicesScreen />);
    fireEvent.press(screen.getByText("Ride"));
    expect(mockPush).toHaveBeenCalledWith("/(shared)/location-picker?kind=dropoff&flow=hailing&focus=1");
    expect(screen.getByText("Request a nearby ride with live driver matching")).toBeOnTheScreen();
    expect(screen.queryByText("Search local journeys and planned city-to-city trips")).toBeNull();
  });
});
