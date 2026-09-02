import unittest

from fastapi import HTTPException

from app.database import database
from app.models.ops import (
    OpsCaseCreateBody,
    OpsCaseEscalateBody,
    OpsCaseNoteBody,
    OpsCaseStatusBody,
    OpsStaffProvisionBody,
)
from app.models.user import UserRole
from app.ops_auth import OPS_ROLE_LEVELS, get_ops_user
from app.routers.ops import (
    add_case_note,
    case_detail,
    create_case,
    escalate_case,
    provision_staff,
    update_case_status,
)


class OpsControlCenterTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in list(database.memory.keys()):
            await database.replace_collection(collection, [])

        self.admin = {
            "id": "admin-1",
            "role": "admin",
            "name": "Admin",
            "email": "admin@example.com",
            "status": "active",
        }
        self.cs_user = {
            "id": "cs-user-1",
            "role": "passenger",
            "name": "Support Agent",
            "email": "support@example.com",
            "status": "active",
        }
        self.manager_user = {
            "id": "manager-user-1",
            "role": "passenger",
            "name": "Operations Manager",
            "email": "manager@example.com",
            "status": "active",
        }
        self.normal_user = {
            "id": "normal-user-1",
            "role": "passenger",
            "name": "Customer",
            "email": "customer@example.com",
            "status": "active",
        }
        for user in (self.admin, self.cs_user, self.manager_user, self.normal_user):
            await database.insert_one("users", user)
        await database.insert_one("ops_staff", {
            "id": "staff-cs",
            "user_id": self.cs_user["id"],
            "role": "cs",
            "enabled": True,
        })
        await database.insert_one("ops_staff", {
            "id": "staff-manager",
            "user_id": self.manager_user["id"],
            "role": "manager",
            "enabled": True,
        })

        self.admin_ops = await get_ops_user(self.admin)
        self.cs_ops = await get_ops_user(self.cs_user)
        self.manager_ops = await get_ops_user(self.manager_user)

    async def test_ops_roles_are_separate_from_mobile_product_roles(self):
        self.assertNotIn("cs", UserRole.__args__)
        self.assertNotIn("manager", UserRole.__args__)
        self.assertEqual(
            set(UserRole.__args__),
            {"passenger", "driver", "courier", "merchant", "admin"},
        )
        self.assertEqual(self.cs_ops["ops_role"], "cs")
        self.assertEqual(self.manager_ops["ops_role"], "manager")
        self.assertEqual(self.admin_ops["ops_role"], "admin")

        stored_cs = await database.find_one("users", {"id": self.cs_user["id"]})
        stored_manager = await database.find_one("users", {"id": self.manager_user["id"]})
        self.assertEqual(stored_cs["role"], "passenger")
        self.assertEqual(stored_manager["role"], "passenger")
        self.assertNotIn("ops_role", stored_cs)
        self.assertNotIn("ops_role", stored_manager)

    async def test_unprovisioned_customer_cannot_enter_operations(self):
        with self.assertRaises(HTTPException) as context:
            await get_ops_user(self.normal_user)
        self.assertEqual(context.exception.status_code, 403)

    async def test_escalation_is_strictly_cs_to_manager_to_admin(self):
        self.assertLess(OPS_ROLE_LEVELS["cs"], OPS_ROLE_LEVELS["manager"])
        self.assertLess(OPS_ROLE_LEVELS["manager"], OPS_ROLE_LEVELS["admin"])

        created_response = await create_case(
            OpsCaseCreateBody(
                subject="Customer cannot complete ride",
                description="Needs investigation",
            ),
            user=self.cs_ops,
        )
        case_id = created_response["data"]["id"]
        self.assertEqual(created_response["data"]["escalation_level"], "cs")
        self.assertEqual(created_response["data"]["assigned_user_id"], self.cs_user["id"])

        manager_response = await escalate_case(
            case_id,
            OpsCaseEscalateBody(reason="CS troubleshooting did not resolve it."),
            user=self.cs_ops,
        )
        self.assertEqual(manager_response["data"]["escalation_level"], "manager")
        self.assertIsNone(manager_response["data"]["assigned_user_id"])

        with self.assertRaises(HTTPException) as cs_blocked:
            await add_case_note(
                case_id,
                OpsCaseNoteBody(note="CS should no longer be able to change this case."),
                user=self.cs_ops,
            )
        self.assertEqual(cs_blocked.exception.status_code, 403)

        await add_case_note(
            case_id,
            OpsCaseNoteBody(note="Manager investigation complete."),
            user=self.manager_ops,
        )
        admin_response = await escalate_case(
            case_id,
            OpsCaseEscalateBody(reason="Manager requires Admin decision."),
            user=self.manager_ops,
        )
        self.assertEqual(admin_response["data"]["escalation_level"], "admin")

        with self.assertRaises(HTTPException) as manager_blocked:
            await add_case_note(
                case_id,
                OpsCaseNoteBody(note="Manager must not mutate an Admin-level case."),
                user=self.manager_ops,
            )
        self.assertEqual(manager_blocked.exception.status_code, 403)

        admin_note = await add_case_note(
            case_id,
            OpsCaseNoteBody(note="Admin accepted the escalation."),
            user=self.admin_ops,
        )
        self.assertEqual(admin_note["data"]["actor_ops_role"], "admin")

    async def test_cs_can_resolve_but_only_manager_or_admin_can_close_case(self):
        created = await create_case(
            OpsCaseCreateBody(subject="Simple support case", description="CS can solve it."),
            user=self.cs_ops,
        )
        case_id = created["data"]["id"]

        resolved = await update_case_status(
            case_id,
            OpsCaseStatusBody(status="resolved", note="Solved by CS."),
            user=self.cs_ops,
        )
        self.assertEqual(resolved["data"]["status"], "resolved")

        with self.assertRaises(HTTPException) as close_blocked:
            await update_case_status(
                case_id,
                OpsCaseStatusBody(status="closed"),
                user=self.cs_ops,
            )
        self.assertEqual(close_blocked.exception.status_code, 403)

        closed = await update_case_status(
            case_id,
            OpsCaseStatusBody(status="closed", note="Manager reviewed closure."),
            user=self.manager_ops,
        )
        self.assertEqual(closed["data"]["status"], "closed")

    async def test_admin_staff_provisioning_never_mutates_mobile_product_role(self):
        response = await provision_staff(
            OpsStaffProvisionBody(
                user_id=self.normal_user["id"],
                role="manager",
                title="Duty Manager",
                reason="Operations team onboarding",
            ),
            user=self.admin_ops,
        )
        self.assertEqual(response["data"]["role"], "manager")

        stored_user = await database.find_one("users", {"id": self.normal_user["id"]})
        staff = await database.find_one("ops_staff", {"user_id": self.normal_user["id"]})
        self.assertEqual(stored_user["role"], "passenger")
        self.assertNotIn("ops_role", stored_user)
        self.assertEqual(staff["role"], "manager")
        self.assertTrue(staff["enabled"])

    async def test_linked_hailing_case_does_not_expose_security_fields(self):
        await database.insert_one("hailing_trips", {
            "id": "hail-1",
            "status": "DRIVER_ASSIGNED",
            "passenger_user_id": self.normal_user["id"],
            "pickup_address": "Harare CBD",
            "dropoff_address": "Avondale",
            "passenger_pin_hash": "must-not-leak",
            "pickup_pin_plaintext": "1234",
            "internal_dispatch_secret": "must-not-leak-either",
        })
        created = await create_case(
            OpsCaseCreateBody(
                subject="Ride Now support",
                description="Driver assigned but customer needs help.",
                source_type="hailing_trip",
                source_id="hail-1",
            ),
            user=self.cs_ops,
        )
        detail = await case_detail(created["data"]["id"], user=self.cs_ops)
        source = detail["data"]["source"]
        self.assertEqual(source["id"], "hail-1")
        self.assertEqual(source["pickup_address"], "Harare CBD")
        self.assertNotIn("passenger_pin_hash", source)
        self.assertNotIn("pickup_pin_plaintext", source)
        self.assertNotIn("internal_dispatch_secret", source)


if __name__ == "__main__":
    unittest.main()
