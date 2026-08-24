import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { RefreshControl } from "react-native";

import CustomerFoodScreen from "../app/(customer)/food";
import { listRestaurants } from "../services/foodService";
import { Restaurant } from "../types/food.types";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useSegments: () => ["(customer)", "food"],
  useLocalSearchParams: () => ({}),
  usePathname: () => "/food",
}));

jest.mock("../services/foodService", () => ({ listRestaurants: jest.fn() }));

const mockListRestaurants = listRestaurants as jest.MockedFunction<typeof listRestaurants>;
const kitchen: Restaurant = {
  id: "kitchen-1",
  name: "LetsGoRide Kitchen",
  description: "Flame-grilled chicken, crisp slaw and house-made sauces.",
  address: "Joina City, Harare",
  cuisine_tags: ["Chicken", "Zimbabwean"],
  is_orderable: true,
  is_accepting_orders: true,
};
const bakery: Restaurant = {
  id: "bakery-1",
  name: "Borrowdale Bakery",
  description: "Fresh bread and pastries baked throughout the morning.",
  address: "Borrowdale, Harare",
  cuisine_tags: ["Bakery"],
  is_orderable: false,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function refresh(screen: ReturnType<typeof render>) {
  act(() => { screen.UNSAFE_getByType(RefreshControl).props.onRefresh(); });
}

describe("Food restaurant data stability", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows a skeleton without fake zero counts on first load", () => {
    mockListRestaurants.mockReturnValue(new Promise(() => undefined));
    const screen = render(<CustomerFoodScreen />);
    expect(screen.getByLabelText("Loading restaurants")).toBeOnTheScreen();
    expect(screen.queryByText(/0 accepting orders/i)).toBeNull();
    expect(screen.getByText("Browse menus near you")).toBeOnTheScreen();
  });

  it("keeps successful restaurant data visible during refresh", async () => {
    const pending = deferred<Restaurant[]>();
    mockListRestaurants.mockResolvedValueOnce([kitchen]).mockReturnValueOnce(pending.promise);
    const screen = render(<CustomerFoodScreen />);
    expect(await screen.findByText("LetsGoRide Kitchen")).toBeOnTheScreen();
    refresh(screen);
    expect(screen.getByText("LetsGoRide Kitchen")).toBeOnTheScreen();
    expect(screen.getByText("1 accepting orders now")).toBeOnTheScreen();
    await act(async () => { pending.resolve([kitchen, bakery]); });
    expect((await screen.findAllByText("Borrowdale Bakery")).length).toBeGreaterThan(0);
  });

  it("preserves prior data after a background failure and retry does not wipe it", async () => {
    mockListRestaurants.mockResolvedValueOnce([kitchen]).mockRejectedValueOnce(new Error("connection lost")).mockResolvedValueOnce([kitchen]);
    const screen = render(<CustomerFoodScreen />);
    await screen.findByText("LetsGoRide Kitchen");
    refresh(screen);
    expect(await screen.findByText("Couldn’t refresh restaurants.")).toBeOnTheScreen();
    expect(screen.getByText("LetsGoRide Kitchen")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByText("LetsGoRide Kitchen")).toBeOnTheScreen();
    await waitFor(() => expect(mockListRestaurants).toHaveBeenCalledTimes(3));
  });

  it("ignores an older failed request after a newer refresh succeeds", async () => {
    const oldRequest = deferred<Restaurant[]>();
    const newRequest = deferred<Restaurant[]>();
    mockListRestaurants.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);
    const screen = render(<CustomerFoodScreen />);
    refresh(screen);
    await act(async () => { newRequest.resolve([kitchen]); });
    expect(await screen.findByText("LetsGoRide Kitchen")).toBeOnTheScreen();
    await act(async () => { oldRequest.reject(new Error("old failure")); });
    expect(screen.getByText("LetsGoRide Kitchen")).toBeOnTheScreen();
    expect(screen.queryByText(/old failure/i)).toBeNull();
  });
});
