from pathlib import Path

path = Path("mobile/app/(driver)/home.tsx")
text = path.read_text()
old = '  const vehicleAdded = Boolean(driver?.vehicle || driver?.vehicle_name);'
new = '  const vehicleAdded = Boolean(driver?.vehicle);'
if old not in text:
    if new in text:
        raise SystemExit(0)
    raise SystemExit("Driver Home vehicle contract marker not found")
path.write_text(text.replace(old, new, 1))
print("Driver Home now uses canonical DriverProfile.vehicle")
