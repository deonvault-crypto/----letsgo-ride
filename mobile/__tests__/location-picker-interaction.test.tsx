import { act, fireEvent, render } from "@testing-library/react-native";

import LocationPickerScreen from "../app/(shared)/location-picker";
import { LocationDraftProvider } from "../contexts/LocationDraftContext";
import { autocompletePlaces, reverseGeocodeLocation } from "../services/routingService";

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
    jest.useFakeTimers();
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

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  function openPicker() {
    return render(<LocationDraftProvider><LocationPickerScreen /></LocationDraftProvider>);
  }

  it("searches without moving the map on each keystroke and focuses once after selection", async () => {
    const screen = openPicker();
    fireEvent.changeText(screen.getByPlaceholderText("Search a place, street or landmark"), "Joina");
    expect(mockFocus).not.toHaveBeenCalled();
    expect(autocompletePlaces).not.toHaveBeenCalled();

    await act(async () => { await jest.advanceTimersByTimeAsync(320); });
    expect(screen.getByText("Joina City")).toBeOnTheScreen();
    expect(mockFocus).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText("Joina City"));
    expect(mockFocus).toHaveBeenCalledTimes(1);
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
    await act(async () => { await jest.advanceTimersByTimeAsync(520); });
    expect(reverseGeocodeLocation).toHaveBeenCalledTimes(1);
    expect(reverseGeocodeLocation).toHaveBeenCalledWith({ latitude: -17.7622, longitude: 31.0902 });
  });
});
