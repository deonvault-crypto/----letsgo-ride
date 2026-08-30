import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { RefreshControl, ScrollView, StyleSheet } from "react-native";

import CustomerFoodScreen from "../app/(customer)/food";
import { listRestaurants } from "../services/foodService";
import { Restaurant } from "../types/food.types";
import { spacing } from "../constants/spacing";

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
const kfc: Restaurant = {
  id: "directory-kfc-zimbabwe",
  name: "KFC Zimbabwe",
  description: "Fried chicken, burgers, meals and quick-service favourites.",
  address: "Zimbabwe",
  cuisine_tags: ["Chicken", "Fast food"],
  is_orderable: false,
  logo_url: null,
};
const directoryRestaurants: Restaurant[] = [
  kfc,
  { ...kfc, id: "directory-chicken-inn-zimbabwe", name: "Chicken Inn Zimbabwe" },
  { ...kfc, id: "directory-pizza-inn-zimbabwe", name: "Pizza Inn Zimbabwe", cuisine_tags: ["Pizza", "Fast food"] },
  { ...kfc, id: "directory-bakers-inn-zimbabwe", name: "Baker's Inn Zimbabwe", cuisine_tags: ["Bakery", "Quick service"] },
];

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

  it("shows a skeleton without fake availability counts on first load", () => {
    mockListRestaurants.mockReturnValue(new Promise(() => undefined));
    const screen = render(<CustomerFoodScreen />);
    expect(screen.getByLabelText("Loading restaurants")).toBeOnTheScreen();
    expect(screen.queryByText(/accepting orders/i)).toBeNull();
    expect(screen.getByText("Explore nearby restaurants and order from places that are open right now.")).toBeOnTheScreen();
  });

  it("keeps successful restaurant data visible during refresh", async () => {
    const pending = deferred<Restaurant[]>();
    mockListRestaurants.mockResolvedValueOnce([kitchen]).mockReturnValueOnce(pending.promise);
    const screen = render(<CustomerFoodScreen />);
    expect(await screen.findByText("LetsGoRide Kitchen")).toBeOnTheScreen();
    refresh(screen);
    expect(screen.getByText("LetsGoRide Kitchen")).toBeOnTheScreen();
    expect(screen.getByText("1 place to explore")).toBeOnTheScreen();
    expect(screen.getByText("Open now")).toBeOnTheScreen();
    expect(screen.queryByText(/accepting orders/i)).toBeNull();
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

  it("keeps open restaurants interactive and unavailable directory entries clearly non-orderable", async () => {
    mockListRestaurants.mockResolvedValueOnce([kitchen, ...directoryRestaurants]);
    const screen = render(<CustomerFoodScreen />);

    await screen.findByText("Open now");
    expect(screen.getByText("More restaurants")).toBeOnTheScreen();
    expect(screen.queryByText(/accepting orders/i)).toBeNull();
    expect(screen.getByRole("button", { name: "LetsGoRide Kitchen, open now" })).toBeOnTheScreen();
    expect(screen.getByTestId("food-image-kitchen-owned")).toBeOnTheScreen();
    expect(screen.getByLabelText("KFC Zimbabwe, currently unavailable")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "KFC Zimbabwe, currently unavailable" })).toBeNull();
    expect(screen.getAllByText("Currently unavailable")).toHaveLength(4);
    expect(screen.getAllByTestId("food-image-official-logo")).toHaveLength(4);
  });

  it("uses the canonical bottom-navigation clearance for the final content", async () => {
    mockListRestaurants.mockResolvedValueOnce([kitchen, kfc]);
    const screen = render(<CustomerFoodScreen />);
    await screen.findByText("KFC Zimbabwe");

    const pageScroll = screen.UNSAFE_getAllByType(ScrollView).find((node) => !node.props.horizontal);
    const contentStyle = StyleSheet.flatten(pageScroll?.props.contentContainerStyle);
    expect(contentStyle.paddingBottom).toBeGreaterThan(spacing.bottomNavHeight);
  });
});
