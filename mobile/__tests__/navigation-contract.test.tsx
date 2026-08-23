import { fireEvent, render } from "@testing-library/react-native";
import { Text } from "react-native";

import { BottomNav } from "../components/layout/BottomNav";
import { Screen } from "../components/ui/Screen";

let mockSegments: string[] = ["(courier)", "home"];
let mockParams: Record<string, string> = {};
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useSegments: () => mockSegments,
  useLocalSearchParams: () => mockParams,
  usePathname: () => `/${mockSegments[mockSegments.length - 1] || ""}`,
  useRouter: () => ({ canGoBack: () => false, back: jest.fn(), push: jest.fn(), replace: mockReplace }),
}));

describe("universal product navigation contract", () => {
  beforeEach(() => { mockReplace.mockClear(); mockSegments = ["(courier)", "home"]; mockParams = {}; });

  it("never renders Back on a product root tab", () => {
    const screen = render(<Screen navRole="courier"><Text>Courier home</Text></Screen>);
    expect(screen.queryByText("Back")).toBeNull();
  });

  it("renders Back for a pushed product route and uses a same-product deep-link fallback", () => {
    mockSegments = ["(courier)", "delivery", "delivery-id"];
    const screen = render(<Screen><Text>Live delivery</Text></Screen>);
    fireEvent.press(screen.getByText("Back"));
    expect(mockReplace).toHaveBeenCalledWith("/(courier)/home");
  });

  it("keeps shared account fallbacks inside the originating worker product", () => {
    mockSegments = ["(shared)", "support"];
    mockParams = { product: "merchant" };
    const screen = render(<Screen showBack fallbackRoute="/(shared)/account"><Text>Support</Text></Screen>);
    fireEvent.press(screen.getByText("Back"));
    expect(mockReplace).toHaveBeenCalledWith("/(merchant)/account");
  });

  it("exposes complete Courier and Merchant primary navigation", () => {
    const courier = render(<BottomNav role="courier" />);
    ["Home", "Offers", "Schedule", "Earnings", "Account"].forEach((label) => expect(courier.getByText(label)).toBeOnTheScreen());
    courier.unmount();
    const merchant = render(<BottomNav role="merchant" />);
    ["Orders", "Menu", "Store", "Insights", "Account"].forEach((label) => expect(merchant.getByText(label)).toBeOnTheScreen());
  });
});
