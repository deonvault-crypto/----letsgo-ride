import { fireEvent, render, screen } from "@testing-library/react-native";

import { SearchableSelect } from "../components/ui/SearchableSelect";
import { COURIER_VEHICLE_TYPES, DRIVER_VEHICLE_TYPES, ZIMBABWE_SERVICE_AREAS } from "../constants/zimbabweOperations";

describe("Zimbabwe operational selectors", () => {
  it("searches canonical cities and returns a stable id", () => {
    const onSelect = jest.fn();
    render(<SearchableSelect label="Working city" value="" options={ZIMBABWE_SERVICE_AREAS} onSelect={onSelect} />);
    fireEvent.press(screen.getByRole("button", { name: "Working city" }));
    fireEvent.changeText(screen.getByPlaceholderText("Search"), "Victoria");
    fireEvent.press(screen.getByText("Victoria Falls"));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "victoria-falls", name: "Victoria Falls" }));
  });

  it("keeps courier and passenger vehicle categories product-specific", () => {
    expect(COURIER_VEHICLE_TYPES.map((item) => item.id)).toContain("bicycle");
    expect(COURIER_VEHICLE_TYPES.map((item) => item.id)).not.toContain("minibus");
    expect(DRIVER_VEHICLE_TYPES.map((item) => item.id)).toContain("minibus");
    expect(DRIVER_VEHICLE_TYPES.map((item) => item.id)).not.toContain("bicycle");
  });
});
