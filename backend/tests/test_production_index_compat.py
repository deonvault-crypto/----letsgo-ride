from pathlib import Path


def test_notification_unread_index_reuses_live_production_name():
    source = Path("app/database.py").read_text(encoding="utf-8")
    assert 'name="notifications_unread_by_user"' in source
    assert 'name="admin_notifications_unread"' not in source


def test_public_ride_availability_query_has_supporting_index():
    source = Path("app/database.py").read_text(encoding="utf-8")
    assert 'name="public_rides_availability"' in source
    assert '[("status", 1), ("date", 1), ("available_seats", 1)]' in source
