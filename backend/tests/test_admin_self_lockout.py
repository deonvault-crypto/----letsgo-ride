import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from starlette.requests import Request

from app.auth import get_admin_user


ADMIN = {
    "id": "admin-self",
    "role": "admin",
    "status": "active",
    "email": "admin@example.com",
}


def request(path: str, method: str = "PATCH") -> Request:
    return Request({
        "type": "http",
        "method": method,
        "path": path,
        "headers": [],
        "client": ("203.0.113.25", 4123),
        "scheme": "https",
        "server": ("test", 443),
        "query_string": b"",
    })


class AdminSelfLockoutTests(unittest.IsolatedAsyncioTestCase):
    async def test_admin_cannot_change_own_account_status(self):
        with patch("app.auth.get_current_user", new=AsyncMock(return_value=ADMIN)):
            with self.assertRaises(HTTPException) as denied:
                await get_admin_user(
                    "Bearer test-token",
                    request(f"/admin/users/{ADMIN['id']}/status"),
                )
        self.assertEqual(denied.exception.status_code, 400)
        self.assertIn("own administrator account", str(denied.exception.detail))

    async def test_admin_can_manage_another_users_status(self):
        with patch("app.auth.get_current_user", new=AsyncMock(return_value=ADMIN)):
            authorized = await get_admin_user(
                "Bearer test-token",
                request("/admin/users/customer-1/status"),
            )
        self.assertEqual(authorized["id"], ADMIN["id"])

    async def test_admin_can_read_own_account_workspace(self):
        with patch("app.auth.get_current_user", new=AsyncMock(return_value=ADMIN)):
            authorized = await get_admin_user(
                "Bearer test-token",
                request(f"/admin/users/{ADMIN['id']}", method="GET"),
            )
        self.assertEqual(authorized["role"], "admin")


if __name__ == "__main__":
    unittest.main()
