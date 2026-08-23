import { fireEvent, render, waitFor } from "@testing-library/react-native";

import SearchRideScreen from "../app/(customer)/search";
import ResultsScreen from "../app/(customer)/results";
import { useRides } from "../hooks/useRides";
import { ride } from "./fixtures";

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
let mockPathname = "/search";
let mockRidesState = { rides: [ride], loading: false, error: null as string | null, reload: jest.fn() };

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  usePathname: () => mockPathname,
  useFocusEffect: (callback: () => void | (() => void)) => { const React = require("react"); React.useEffect(() => callback(), [callback]); },
}));
jest.mock("../hooks/useRides", () => ({ useRides: jest.fn(() => mockRidesState) }));

describe("customer ride search flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    mockPathname = "/search";
    mockRidesState = { rides: [ride], loading: false, error: null, reload: jest.fn() };
  });

  it("uses location selectors, date picker, and navigates with selected search params", async () => {
    const screen = render(<SearchRideScreen />);
    fireEvent.press(screen.getByRole("button", { name: "Origin" }));
    expect(screen.getByPlaceholderText("Search or type a location")).toBeOnTheScreen();
    fireEvent.press(screen.getByText("Gweru"));
    fireEvent.press(screen.getByRole("button", { name: "Destination" }));
    fireEvent.press(screen.getByText("Harare"));
    fireEvent.press(screen.getByRole("button", { name: "Travel date" }));
    fireEvent.press(screen.getByText("Today"));
    fireEvent.press(screen.getByRole("button", { name: "Search rides" }));
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ pathname: "/(customer)/results", params: expect.objectContaining({ origin: "Gweru", destination: "Harare", seats: "1" }) }));
    expect(mockPush.mock.calls[0][0].params.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("displays ride results and a clean empty state", async () => {
    mockParams = { origin: "Harare", destination: "Bulawayo", date: "2026-06-03", seats: "1" };
    mockPathname = "/results";
    const screen = render(<ResultsScreen />);
    expect(useRides).toHaveBeenCalledWith({ origin: "Harare", destination: "Bulawayo", date: "2026-06-03", seats: 1 });
    expect(screen.getAllByText("Harare to Bulawayo").length).toBeGreaterThan(0);
    mockRidesState = { rides: [], loading: false, error: null, reload: jest.fn() };
    screen.rerender(<ResultsScreen />);
    await waitFor(() => {
      expect(screen.getByText("No rides yet")).toBeOnTheScreen();
      expect(screen.getByText("Try a nearby city, a later date, or fewer seats.")).toBeOnTheScreen();
    });
  });
});
