from pathlib import Path

path = Path("backend/app/routers/drivers.py")
text = path.read_text()
old = '''    if reviewed_driver and existing_vehicles:
        api_error(
            "Contact LetsGoRide Support to request a reviewed vehicle change.",
            403,
        )
'''
new = '''    has_reviewed_vehicle = bool(existing_vehicles) or bool(str(driver.get("vehicle") or "").strip())
    if reviewed_driver and has_reviewed_vehicle:
        api_error(
            "Contact LetsGoRide Support to request a reviewed vehicle change.",
            403,
        )
'''
if old not in text:
    if new in text:
        raise SystemExit(0)
    raise SystemExit("reviewed vehicle protection marker not found")
path.write_text(text.replace(old, new, 1))
print("Reviewed legacy vehicle integrity restored")
