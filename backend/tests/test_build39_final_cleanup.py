from app.services.hailing_city_service import DEFAULT_CITY_PRICING, enabled_ride_classes
from app.services.verification_service import REQUIRED_DOCUMENTS, REQUIRED_DOCUMENT_TYPES, _normalize_document_type


def test_driver_verification_no_longer_requires_vehicle_registration():
    assert REQUIRED_DOCUMENTS == ["selfie", "identity_document", "driver_license"]
    assert REQUIRED_DOCUMENT_TYPES == {"selfie", "identity_document", "driver_license"}
    assert _normalize_document_type("vehicle_registration_or_logbook") == "vehicle_registration_or_logbook"


def test_all_launch_ride_classes_have_one_enabled_source_of_truth():
    assert all(DEFAULT_CITY_PRICING[ride_class]["enabled"] is True for ride_class in ("ECONOMY", "COMFORT", "XL"))
    stale = {"pricing": {"ECONOMY": {"enabled": True}, "COMFORT": {"enabled": False}, "XL": {"enabled": False}}}
    assert enabled_ride_classes(stale) == ["ECONOMY", "COMFORT", "XL"]
