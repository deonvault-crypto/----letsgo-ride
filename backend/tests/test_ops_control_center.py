import inspect

from app.models.user import UserRole
from app.ops_auth import OPS_ROLE_LEVELS, can_manage_case_level, effective_ops_role
from app.routers import ops as ops_router


def test_ops_roles_are_separate_from_mobile_product_roles():
    # The store-review mobile contract stays untouched. CS and Manager are
    # operations privileges, not mobile account/product roles.
    assert "cs" not in UserRole.__args__
    assert "manager" not in UserRole.__args__
    assert set(UserRole.__args__) == {"passenger", "driver", "courier", "merchant", "admin"}


def test_existing_admin_automatically_has_ops_admin_access():
    assert effective_ops_role({"role": "admin"}) == "admin"
    assert effective_ops_role({"role": "passenger", "ops_role": "cs"}) == "cs"
    assert effective_ops_role({"role": "driver", "ops_role": "manager"}) == "manager"
    assert effective_ops_role({"role": "passenger"}) == ""


def test_escalation_hierarchy_is_strictly_ordered():
    assert OPS_ROLE_LEVELS["cs"] < OPS_ROLE_LEVELS["manager"] < OPS_ROLE_LEVELS["admin"]
    assert can_manage_case_level({"ops_role": "cs"}, "cs") is True
    assert can_manage_case_level({"ops_role": "cs"}, "manager") is False
    assert can_manage_case_level({"ops_role": "manager"}, "manager") is True
    assert can_manage_case_level({"ops_role": "manager"}, "admin") is False
    assert can_manage_case_level({"role": "admin"}, "admin") is True


def test_ops_router_is_additive_and_does_not_reuse_mobile_paths():
    assert ops_router.router.prefix == "/ops"
    source = inspect.getsource(ops_router)
    assert 'CASE_LEVEL_ORDER = ["cs", "manager", "admin"]' in source
    assert '"support_messages"' in source
    assert '"audit_logs"' in source
    assert '/hailing/driver/online' not in source
    assert '/operations/courier/online' not in source


def test_ops_overview_uses_bounded_recent_support_tail():
    source = inspect.getsource(ops_router.overview)
    assert 'database.count("users")' in source
    assert 'database.count("support_messages"' in source
    assert 'limit=8' in source
