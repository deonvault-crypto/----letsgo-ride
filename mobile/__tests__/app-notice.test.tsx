import { fireEvent, render, screen } from "@testing-library/react-native";

import { AppNotice } from "../components/ui/AppNotice";

describe("transient app notice", () => {
  it("presents a compact recoverable API error with retry and dismiss actions", () => {
    const retry = jest.fn();
    const dismiss = jest.fn();
    render(<AppNotice message="Could not connect. Please try again." actionLabel="Retry" onAction={retry} onDismiss={dismiss} />);
    expect(screen.getByRole("alert")).toBeOnTheScreen();
    fireEvent.press(screen.getByText("Retry"));
    fireEvent.press(screen.getByRole("button", { name: "Dismiss" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});
