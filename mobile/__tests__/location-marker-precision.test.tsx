import fs from "fs";
import path from "path";
import { render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import {
  LOCATION_SELECTION_MARKER_METRICS,
  LocationSelectionMarker,
} from "../components/maps/LocationSelectionMarker";

const read = (relativePath: string) => fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");

describe("location selection marker precision", () => {
  it("anchors the compact visual's bottom tip to the map center", () => {
    const screen = render(<LocationSelectionMarker accessibilityLabel="Selected pickup coordinate" />);
    const anchor = StyleSheet.flatten(screen.getByTestId("location-selection-marker").props.style);
    const visual = StyleSheet.flatten(screen.getByTestId("location-selection-marker-visual").props.style);

    expect(LOCATION_SELECTION_MARKER_METRICS.anchor).toEqual({ x: 0.5, y: 1 });
    expect(anchor).toMatchObject({
      left: "50%",
      top: "50%",
      width: 44,
      height: 44,
      marginLeft: -22,
      marginTop: -44,
      justifyContent: "flex-end",
    });
    expect(visual).toMatchObject({ width: 22, height: 32 });
  });

  it("keeps a precise inner dot and an accessible label", () => {
    const screen = render(<LocationSelectionMarker accessibilityLabel="Selected destination coordinate" />);
    const dot = StyleSheet.flatten(screen.getByTestId("location-selection-marker-dot").props.style);

    expect(screen.getByLabelText("Selected destination coordinate")).toHaveProp("accessibilityRole", "image");
    expect(dot).toMatchObject({ width: 5, height: 5, backgroundColor: "#FFFFFF" });
  });

  it("uses one canonical marker for pickup, destination, and delivery picker entry points", () => {
    const picker = read("app/(shared)/location-picker.tsx");
    const courier = read("app/(shared)/courier.tsx");
    const checkout = read("app/(shared)/food/checkout.tsx");

    expect(picker.match(/<LocationSelectionMarker\b/g)).toHaveLength(1);
    expect(picker).not.toContain("pinBubble");
    expect(picker).not.toContain("centerPin");
    expect(courier).toContain('params: { kind: "pickup" }');
    expect(courier).toContain('params: { kind: "dropoff" }');
    expect(checkout).toContain('/(shared)/location-picker?kind=food');
  });
});
