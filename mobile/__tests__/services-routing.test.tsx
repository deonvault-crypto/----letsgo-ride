import { fireEvent, render } from "@testing-library/react-native";

import ServicesScreen from "../app/(shared)/services";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/services",
}));

describe("Ride and Intercity service routing", () => {
  it("opens Intercity as an explicit intent within Ride search", () => {
    const screen = render(<ServicesScreen />);
    fireEvent.press(screen.getByText("Intercity"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/(customer)/search", params: { intent: "intercity" } });
  });
});
