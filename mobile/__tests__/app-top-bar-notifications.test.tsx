import { render } from "@testing-library/react-native";

import { AppTopBar } from "../components/layout/AppTopBar";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false }),
  useSegments: () => ["(customer)", "home"],
}));

jest.mock("../contexts/NotificationContext", () => ({
  useNotifications: () => ({ unreadCount: 2 }),
}));

describe("AppTopBar notifications", () => {
  it("renders shared unread state without creating a polling timer", () => {
    const timerSpy = jest.spyOn(global, "setInterval");
    const screen = render(<AppTopBar />);
    expect(screen.getByText("2")).toBeOnTheScreen();
    expect(timerSpy).not.toHaveBeenCalled();
    timerSpy.mockRestore();
  });
});
