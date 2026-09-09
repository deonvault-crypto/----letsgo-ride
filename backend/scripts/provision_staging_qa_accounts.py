import asyncio
import os
from dataclasses import dataclass
from typing import Iterable

from app.config import get_settings
from app.database import database
from app.services.auth_service import (
    create_password_record,
    find_user_by_email,
    password_matches,
    password_needs_upgrade,
)
from app.utils import now_iso


@dataclass(frozen=True)
class QAAccountSpec:
    label: str
    email_env: str
    password_env: str
    expected_role: str


QA_ACCOUNT_SPECS = (
    QAAccountSpec("Admin", "QA_ADMIN_EMAIL", "QA_ADMIN_PASSWORD", "admin"),
    QAAccountSpec("Customer", "QA_CUSTOMER_EMAIL", "QA_CUSTOMER_PASSWORD", "passenger"),
    QAAccountSpec("Driver", "QA_DRIVER_EMAIL", "QA_DRIVER_PASSWORD", "driver"),
    QAAccountSpec("Courier", "QA_COURIER_EMAIL", "QA_COURIER_PASSWORD", "courier"),
    QAAccountSpec("Merchant", "QA_MERCHANT_EMAIL", "QA_MERCHANT_PASSWORD", "merchant"),
)


def _require_staging_environment(app_env: str, database_name: str) -> None:
    if app_env.strip().lower() != "staging":
        raise RuntimeError("Staging QA provisioning is forbidden outside APP_ENV=staging.")
    if database_name.strip().lower() != "letsgoride_staging":
        raise RuntimeError(
            "Staging QA provisioning refuses any database other than letsgoride_staging."
        )


def _required_env(name: str) -> str:
    value = os.getenv(name, "")
    if not value:
        raise RuntimeError(f"Required staging QA environment variable is missing: {name}")
    return value.strip() if name.endswith("_EMAIL") else value


def _load_credentials(
    specs: Iterable[QAAccountSpec] = QA_ACCOUNT_SPECS,
) -> list[tuple[QAAccountSpec, str, str]]:
    credentials: list[tuple[QAAccountSpec, str, str]] = []
    for spec in specs:
        email = _required_env(spec.email_env).lower()
        password = _required_env(spec.password_env)
        credentials.append((spec, email, password))
    return credentials


async def _verify_role_state(spec: QAAccountSpec, user: dict) -> None:
    if user.get("status") != "active":
        raise RuntimeError(f"{spec.label} QA account is not active.")
    if user.get("role") != spec.expected_role:
        raise RuntimeError(f"{spec.label} QA account has an unexpected role.")
    if not user.get("email_verified", False):
        raise RuntimeError(f"{spec.label} QA account email is not verified.")

    if spec.expected_role == "driver":
        driver = await database.find_one("drivers", {"user_id": user["id"]})
        if (
            not driver
            or str(driver.get("status", "")).lower() != "approved"
            or not driver.get("verified", False)
        ):
            raise RuntimeError("Driver QA profile is not approved and verified.")

    if spec.expected_role == "courier":
        courier = await database.find_one("courier_profiles", {"user_id": user["id"]})
        if not courier or str(courier.get("status", "")).upper() != "APPROVED":
            raise RuntimeError("Courier QA profile is not approved.")

    if spec.expected_role == "merchant":
        restaurant = await database.find_one(
            "restaurants", {"owner_user_id": user["id"]}
        )
        if not restaurant or str(restaurant.get("status", "")).upper() != "ACTIVE":
            raise RuntimeError("Merchant QA account has no active restaurant.")


async def provision_staging_qa_accounts() -> None:
    settings = get_settings()
    _require_staging_environment(settings.app_env, settings.mongodb_db_name)
    credentials = _load_credentials()

    await database.connect()
    try:
        for spec, email, password in credentials:
            user = await find_user_by_email(email)
            if not user:
                raise RuntimeError(
                    f"{spec.label} QA account is missing; refusing to create it automatically."
                )

            await _verify_role_state(spec, user)

            should_rotate = (
                not password_matches(user, password) or password_needs_upgrade(user)
            )
            if should_rotate:
                timestamp = now_iso()
                await database.update_one(
                    "users",
                    user["id"],
                    {
                        **create_password_record(password),
                        "token": "",
                        "token_issued_at": None,
                        "token_expires_at": None,
                        "sessions_revoked_at": timestamp,
                        "updated_at": timestamp,
                    },
                )
                print(f"{spec.label} QA credentials updated.")
            else:
                print(f"{spec.label} QA credentials verified.")
    finally:
        await database.close()


if __name__ == "__main__":
    asyncio.run(provision_staging_qa_accounts())
