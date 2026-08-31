from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        if new in text:
            return
        raise SystemExit(f"Marker not found in {path}: {old!r}")
    file.write_text(text.replace(old, new, 1))


# Mobile fallback must agree with the backend: all three launch classes remain usable
# even while config is being restored after a weak-network start.
replace_once(
    "mobile/app/(customer)/hail/index.tsx",
    '  { id: "COMFORT", label: "Comfort", enabled: false },',
    '  { id: "COMFORT", label: "Comfort", enabled: true },',
)
replace_once(
    "mobile/app/(customer)/hail/index.tsx",
    '  { id: "XL", label: "XL", enabled: false },',
    '  { id: "XL", label: "XL", enabled: true },',
)

# Generic selection treatment is monochrome; brand green remains reserved for the Go wordmark.
replace_once(
    "mobile/components/hailing/RideClassCar.tsx",
    '    backgroundColor: "rgba(84,199,121,0.14)",',
    '    backgroundColor: "rgba(17,17,17,0.09)",',
)
replace_once(
    "mobile/components/hailing/RideClassCar.tsx",
    '    shadowColor: "#54C779",',
    '    shadowColor: "#111111",',
)

# Point the regression test at the asset the selector actually renders.
test_path = Path("mobile/__tests__/build39-final-cleanup.test.ts")
text = test_path.read_text()
text = text.replace(
    'const png = fs.readFileSync(path.join(root, "assets/images/hailing/comfort-executive.png"));\n    expect([4, 6]).toContain(png.readUInt8(25));\n    expect(png.length).toBeLessThan(100_000);',
    'const png = fs.readFileSync(path.join(root, "assets/images/hailing/ride-comfort.png"));\n    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));\n    expect(png.readUInt32BE(16)).toBe(320);\n    expect(png.readUInt32BE(20)).toBe(180);\n    expect(png.includes(Buffer.from("tRNS"))).toBe(true);\n    expect(png.length).toBeLessThan(100_000);',
    1,
)
if "ride-comfort.png" not in text or "tRNS" not in text:
    raise SystemExit("Comfort asset regression test did not update")
test_path.write_text(text)

assert 'COMFORT", label: "Comfort", enabled: true' in Path("mobile/app/(customer)/hail/index.tsx").read_text()
assert 'XL", label: "XL", enabled: true' in Path("mobile/app/(customer)/hail/index.tsx").read_text()
assert "84,199,121" not in Path("mobile/components/hailing/RideClassCar.tsx").read_text()
print("Build 39 additional Ride-class sanitation applied")
