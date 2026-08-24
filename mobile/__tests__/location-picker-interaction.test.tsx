import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import LocationPickerScreen from "../app/(shared)/location-picker";
import { LocationDraftProvider } from "../contexts/LocationDraftContext";
import { autocompletePlaces, reverseGeocodeLocation } from "../services/routingService";
import { getCurrentDeviceLocation } from "../services/locationService";

const mockFocus = jest.fn();
let mockMapCallbacks: {
  onMovementStart?: () => void;
  onRegionChangeComplete: (region: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }) => void;
};

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ kind: "pickup" }),
  useSegments: () => ["(shared)", "location-picker"],
}));

jest.mock("../components/maps/LocationPickerMap", () => {
  const ReactMock = require("react");
  const { View: MockView } = require("react-native");
  return {
    LocationPickerMap: ReactMock.forwardRef((props: typeof mockMapCallbacks, ref: unknown) => {
      mockMapCallbacks = props;
      ReactMock.useImperativeHandle(ref, () => ({ focus: mockFocus }));
      return ReactMock.createElement(MockView, { testID: "location-map" });
    }),
  };
});

jest.mock("../services/locationMemoryService", () => ({
  getLocationMemory: jest.fn(async () => ({ home: null, work: null, recent: [] })),
  rememberLocation: jest.fn(async () => undefined),
  saveNamedLocation: jest.fn(),
}));

jest.mock("../services/locationService", () => ({
  getCurrentDeviceLocation: jest.fn(),
}));

jest.mock("../services/routingService", () => ({
  autocompletePlaces: jest.fn(),
  getPlaceDetail: jest.fn(),
  reverseGeocodeLocation: jest.fn(),
}));

describe("location picker interaction stability", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (autocompletePlaces as jest.Mock).mockResolvedValue([{
      place_id: "place-1",
      primary_text: "Joina City",
      secondary_text: "Harare",
      description: "Joina City, Harare",
      location: { latitude: -17.8316, longitude: 31.0488 },
    }]);
    (reverseGeocodeLocation as jest.Mock).mockResolvedValue({
      place_id: "pin-2",
      formatted_address: "Sam Levy’s Village, Borrowdale, Harare",
      location: { latitude: -17.7622, longitude: 31.0902 },
    });
  });

  function openPicker() {
    return render(<LocationDraftProvider><LocationPickerScreen /></LocationDraftProvider>);
  }

  it("searches without moving the map on each keystroke and focuses once after selection", async () => {
    const screen = openPicker();
    fireEvent.changeText(screen.getByPlaceholderText("Search a place, street or landmark"), "Joina");
    expect(mockFocus).not.toHaveBeenCalled();
    expect(autocompletePlaces).not.toHaveBeenCalled();

    await waitFor(() => expect(screen.getByText("Joina City")).toBeOnTheScreen(), { timeout: 3000 });
    expect(mockFocus).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText("Joina City"));
    await waitFor(() => expect(mockFocus).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(reverseGeocodeLocation).not.toHaveBeenCalled();
  });

  it("reverse geocodes only the last settled user-drag position", async () => {
    openPicker();
    act(() => {
      mockMapCallbacks.onMovementStart?.();
      mockMapCallbacks.onRegionChangeComplete({ latitude: -17.825, longitude: 31.05, latitudeDelta: 0.02, longitudeDelta: 0.02 });
      mockMapCallbacks.onMovementStart?.();
      mockMapCallbacks.onRegionChangeComplete({ latitude: -17.7622, longitude: 31.0902, latitudeDelta: 0.02, longitudeDelta: 0.02 });
    });

    expect(reverseGeocodeLocation).not.toHaveBeenCalled();
    await waitFor(() => expect(reverseGeocodeLocation).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(reverseGeocodeLocation).toHaveBeenCalledWith({ latitude: -17.7622, longitude: 31.0902 });
  });

  it("ignores stale autocomplete responses and never assumes current location", async () => {
    let resolveFirst: (value: unknown[]) => void = () => undefined;
    let resolveSecond: (value: unknown[]) => void = () => undefined;
    (autocompletePlaces as jest.Mock)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
    const screen = openPicker();
    expect(getCurrentDeviceLocation).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByPlaceholderText("Search a place, street or landmark"), "Joina");
    await waitFor(() => expect(autocompletePlaces).toHaveBeenCalledTimes(1), { timeout: 3000 });
    fireEvent.changeText(screen.getByPlaceholderText("Search a place, street or landmark"), "Sam Levy");
    await waitFor(() => expect(autocompletePlaces).toHaveBeenCalledTimes(2), { timeout: 3000 });
    await act(async () => { resolveSecond([{ place_id: "sam", primary_text: "Sam Levy’s Village", description: "Sam Levy’s Village, Borrowdale", location: { latitude: -17.7622, longitude: 31.0902 } }]); });
    expect(await screen.findByText("Sam Levy’s Village")).toBeOnTheScreen();
    await act(async () => { resolveFirst([{ place_id: "joina", primary_text: "Joina City", description: "Joina City, Harare", location: { latitude: -17.8316, longitude: 31.0488 } }]); });
    expect(screen.queryByText("Joina City")).toBeNull();
    expect(mockFocus).not.toHaveBeenCalled();
  });
});
