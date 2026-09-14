import inspect

from app.routers import admin as admin_router
from app.services import admin_read_service


def test_admin_user_views_do_not_reference_retired_demo_filter():
    enrich_source = inspect.getsource(admin_read_service.enrich_admin_users)
    detail_source = inspect.getsource(admin_router.user_detail)

    assert "_is_real_ride" not in enrich_source
    assert "_is_real_ride" not in detail_source
    assert 'public["posted_rides_count"] = len(rides_by_user.get(user_id, []))' in enrich_source
