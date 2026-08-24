from typing import Dict, Set


SERVICE_AREAS: Dict[str, str] = {
    "harare": "Harare", "bulawayo": "Bulawayo", "chitungwiza": "Chitungwiza",
    "mutare": "Mutare", "gweru": "Gweru", "kwekwe": "Kwekwe",
    "masvingo": "Masvingo", "kadoma": "Kadoma", "marondera": "Marondera",
    "victoria-falls": "Victoria Falls", "hwange": "Hwange", "bindura": "Bindura",
    "chinhoyi": "Chinhoyi", "kariba": "Kariba", "zvishavane": "Zvishavane",
    "beitbridge": "Beitbridge", "rusape": "Rusape", "chegutu": "Chegutu",
    "gwanda": "Gwanda", "norton": "Norton",
}

VEHICLE_TYPES: Dict[str, Set[str]] = {
    "courier": {"bicycle", "motorbike", "scooter", "car", "pickup", "van"},
    "driver": {"sedan", "hatchback", "suv", "pickup", "van", "minibus"},
}


def canonical_service_area(area_id: str) -> str:
    clean = str(area_id or "").strip().lower()
    if clean not in SERVICE_AREAS:
        raise ValueError("Choose a supported Zimbabwe service area.")
    return SERVICE_AREAS[clean]


def validate_vehicle_type(product: str, vehicle_type: str) -> str:
    clean = str(vehicle_type or "").strip().lower()
    if clean not in VEHICLE_TYPES.get(product, set()):
        raise ValueError("Choose a supported vehicle type for this application.")
    return clean
