import { render } from "@testing-library/react-native";
import { Animated, View } from "react-native";

import { LiveLocationMarker } from "../components/maps/LiveLocationMarker";
import { isMapCoordinate, markerMotionDuration, nearestHeading } from "../utils/mapMotion";

let mockCanAnimate = true;
const mockCoordinateTiming = jest.fn();
const mockMoveStop = jest.fn();
jest.mock("../hooks/useMotionSettings", () => ({ useMotionSettings: () => ({ canAnimate: mockCanAnimate }) }));
jest.mock("react-native-maps", () => {
  const { View } = require("react-native");
  return {
    Marker: { Animated: View },
    AnimatedRegion: class { timing(config: unknown) { return mockCoordinateTiming(config); } },
  };
});

const now = Date.parse("2026-09-03T12:00:00Z");
const oldPoint = { latitude: -17.825, longitude: 31.05, heading: 359, updated_at: new Date(now - 4000).toISOString() };
const newPoint = { ...oldPoint, latitude: -17.8249, heading: 1, updated_at: new Date(now).toISOString() };

describe("tracking uses received GPS fixes only", () => {
  beforeEach(() => {
    mockCanAnimate = true;
    jest.clearAllMocks();
    jest.spyOn(Date, "now").mockReturnValue(now);
    mockCoordinateTiming.mockReturnValue({ start: jest.fn(), stop: mockMoveStop, reset: jest.fn() });
    jest.spyOn(Animated, "timing").mockReturnValue({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() });
  });
  afterEach(() => jest.restoreAllMocks());

  it("only interpolates short, recent fixes; first fixes, gaps and corrections snap", () => {
    expect(markerMotionDuration(oldPoint, newPoint, 4000, now)).toBe(600);
    expect(markerMotionDuration(null, newPoint, 4000, now)).toBe(0);
    expect(markerMotionDuration(oldPoint, newPoint, 20_000, now)).toBe(0);
    expect(markerMotionDuration(oldPoint, { ...newPoint, latitude: -18.0 }, 4000, now)).toBe(0);
    expect(markerMotionDuration(oldPoint, newPoint, 4000, now + 20_000)).toBe(0);
    expect(markerMotionDuration(oldPoint, oldPoint, 4000, now)).toBe(0);
    expect(markerMotionDuration({ latitude: 0, longitude: 179.999 }, { latitude: 0, longitude: -179.999 }, 4000, now)).toBe(0);
  });

  it("rejects invalid coordinates and turns through the shortest heading change", () => {
    expect(isMapCoordinate({ latitude: NaN, longitude: 31 })).toBe(false);
    expect(isMapCoordinate({ latitude: -17.8, longitude: Infinity })).toBe(false);
    expect(isMapCoordinate({ latitude: 91, longitude: 31 })).toBe(false);
    expect(isMapCoordinate({ latitude: -17.8, longitude: 181 })).toBe(false);
    expect(isMapCoordinate(oldPoint)).toBe(true);
    expect(nearestHeading(359, 1)).toBe(361);
    expect(nearestHeading(1, 359)).toBe(-1);
    expect(nearestHeading(120, -1)).toBe(120);
    expect(nearestHeading(120, null)).toBe(120);
  });

  it("snaps the first point and settles at each real update without ongoing motion", () => {
    const view = render(<LiveLocationMarker location={oldPoint} title="Driver"><View /></LiveLocationMarker>);
    expect(mockCoordinateTiming).toHaveBeenLastCalledWith(expect.objectContaining({ latitude: oldPoint.latitude, duration: 0 }));
    view.rerender(<LiveLocationMarker location={newPoint} title="Driver"><View /></LiveLocationMarker>);
    expect(mockCoordinateTiming).toHaveBeenLastCalledWith(expect.objectContaining({ latitude: newPoint.latitude, longitude: newPoint.longitude, duration: 600 }));
    const calls = mockCoordinateTiming.mock.calls.length;
    view.rerender(<LiveLocationMarker location={{ ...newPoint }} title="Driver"><View /></LiveLocationMarker>);
    expect(mockCoordinateTiming).toHaveBeenCalledTimes(calls);
    view.unmount();
    expect(mockMoveStop).toHaveBeenCalled();
  });

  it("holds the latest accepted fix when an older sample arrives", () => {
    const view = render(<LiveLocationMarker location={oldPoint} title="Driver"><View /></LiveLocationMarker>);
    view.rerender(<LiveLocationMarker location={newPoint} title="Driver"><View /></LiveLocationMarker>);
    view.rerender(<LiveLocationMarker location={oldPoint} title="Driver"><View /></LiveLocationMarker>);
    expect(mockCoordinateTiming).toHaveBeenLastCalledWith(expect.objectContaining({ latitude: newPoint.latitude, duration: 0 }));
  });

  it("resets to the first received position when the trip or assigned person changes", () => {
    const view = render(<LiveLocationMarker key="trip-a:driver-a" location={newPoint} title="Driver"><View /></LiveLocationMarker>);
    view.rerender(<LiveLocationMarker key="trip-b:driver-b" location={oldPoint} title="Driver"><View /></LiveLocationMarker>);
    expect(mockCoordinateTiming).toHaveBeenLastCalledWith(expect.objectContaining({ latitude: oldPoint.latitude, duration: 0 }));
  });

  it("stops and snaps when reduced motion, backgrounding or terminal tracking disables movement", () => {
    const view = render(<LiveLocationMarker location={oldPoint} title="Courier"><View /></LiveLocationMarker>);
    view.rerender(<LiveLocationMarker location={newPoint} title="Courier"><View /></LiveLocationMarker>);
    mockCanAnimate = false;
    view.rerender(<LiveLocationMarker location={newPoint} title="Courier"><View /></LiveLocationMarker>);
    expect(mockMoveStop).toHaveBeenCalled();
    expect(mockCoordinateTiming).toHaveBeenLastCalledWith(expect.objectContaining({ duration: 0, latitude: newPoint.latitude }));
    mockCanAnimate = true;
    view.rerender(<LiveLocationMarker location={newPoint} animate={false} title="Courier"><View /></LiveLocationMarker>);
    expect(mockCoordinateTiming).toHaveBeenLastCalledWith(expect.objectContaining({ duration: 0 }));
  });
});
