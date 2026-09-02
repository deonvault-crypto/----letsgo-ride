from app.routers.admin import _is_real_ride


def test_admin_real_ride_filter_excludes_only_explicit_demo_rides():
    assert _is_real_ride({"id": "production-ride"}) is True
    assert _is_real_ride({"id": "production-ride", "is_demo": False}) is True
    assert _is_real_ride({"id": "legacy-demo", "is_demo": True}) is False
