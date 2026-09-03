import { fireEvent, render } from "@testing-library/react-native";
import { Animated, Text } from "react-native";

import { AppButton } from "../components/ui/AppButton";
import { MotionView } from "../components/ui/MotionView";

let mockCanAnimate = true;
jest.mock("../hooks/useMotionSettings", () => ({
  useMotionSettings: () => ({ canAnimate: mockCanAnimate, reduceMotion: !mockCanAnimate, active: true }),
}));

describe("functional product motion", () => {
  const stop = jest.fn();
  beforeEach(() => {
    mockCanAnimate = true;
    jest.clearAllMocks();
    jest.spyOn(Animated, "timing").mockImplementation(() => ({ start: jest.fn(), stop, reset: jest.fn() }));
  });
  afterEach(() => jest.restoreAllMocks());

  it("keeps content present and animates state changes, not ordinary rerenders", () => {
    const view = render(<MotionView changeKey="searching"><Text>Finding a driver</Text></MotionView>);
    expect(view.getByText("Finding a driver")).toBeVisible();
    expect(Animated.timing).not.toHaveBeenCalled();
    view.rerender(<MotionView changeKey="searching"><Text>Finding a driver</Text></MotionView>);
    expect(Animated.timing).not.toHaveBeenCalled();
    view.rerender(<MotionView changeKey="assigned"><Text>Driver assigned</Text></MotionView>);
    expect(view.getByText("Driver assigned")).toBeVisible();
    expect(Animated.timing).toHaveBeenCalledTimes(1);
    view.rerender(<MotionView changeKey="assigned"><Text>Driver assigned</Text></MotionView>);
    expect(Animated.timing).toHaveBeenCalledTimes(1);
  });

  it("stops an in-flight transition when motion is disabled and does not replay on resume", () => {
    const view = render(<MotionView animateOnMount><Text>Support reply</Text></MotionView>);
    expect(Animated.timing).toHaveBeenCalledTimes(1);
    mockCanAnimate = false;
    view.rerender(<MotionView animateOnMount><Text>Support reply</Text></MotionView>);
    expect(stop).toHaveBeenCalled();
    expect(view.getByText("Support reply")).toBeVisible();
    mockCanAnimate = true;
    view.rerender(<MotionView animateOnMount><Text>Support reply</Text></MotionView>);
    expect(Animated.timing).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it("dispatches a button action immediately and preserves loading/disabled behavior", () => {
    const action = jest.fn();
    const view = render(<AppButton title="Send reply" onPress={action} />);
    fireEvent(view.getByRole("button"), "pressIn");
    fireEvent.press(view.getByRole("button"));
    expect(action).toHaveBeenCalledTimes(1);
    view.rerender(<AppButton title="Sending reply…" loading onPress={action} />);
    expect(view.getByRole("button")).toBeDisabled();
    expect(view.getByText("Sending reply…")).toBeVisible();
    fireEvent.press(view.getByRole("button"));
    expect(action).toHaveBeenCalledTimes(1);
    view.rerender(<AppButton title="Send reply" onPress={action} />);
    fireEvent.press(view.getByRole("button"));
    expect(action).toHaveBeenCalledTimes(2);
  });

  it("keeps actions usable and content visible with Reduce Motion enabled", () => {
    mockCanAnimate = false;
    const action = jest.fn();
    const view = render(<MotionView animateOnMount><AppButton title="Retry" onPress={action} /></MotionView>);
    fireEvent(view.getByRole("button"), "pressIn");
    fireEvent.press(view.getByRole("button"));
    expect(action).toHaveBeenCalledTimes(1);
    expect(Animated.timing).not.toHaveBeenCalled();
    expect(view.getByText("Retry")).toBeVisible();
  });
});
