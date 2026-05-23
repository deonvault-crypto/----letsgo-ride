import hashlib
import secrets
from typing import Any, Dict, Optional

from app.database import database
from app.utils import new_id, now_iso


async def find_user_by_phone(phone: str) -> Optional[Dict[str, Any]]:
    return await database.find_one("users", {"phone": phone})


async def find_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    return await database.find_one("users", {"email": email.lower().strip()})


async def find_user_by_token(token: str) -> Optional[Dict[str, Any]]:
    return await database.find_one("users", {"token": token})


def hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        120000,
    ).hex()


def create_password_record(password: str) -> Dict[str, str]:
    salt = secrets.token_hex(16)
    return {"password_salt": salt, "password_hash": hash_password(password, salt)}


async def create_or_update_user(phone: str, role: str, name: Optional[str] = None) -> Dict[str, Any]:
    existing = await find_user_by_phone(phone)
    token = f"auth_{new_id()}"
    timestamp = now_iso()

    if existing:
        updates = {
            "role": role or existing.get("role", "passenger"),
            "token": token,
            "updated_at": timestamp,
        }
        if name:
            updates["name"] = name
        updated = await database.update_one("users", existing["id"], updates)
        return updated or existing

    user = {
        "id": new_id(),
        "phone": phone,
        "name": name or "LetsGo Ride user",
        "city": "Harare",
        "role": role,
        "rating": 4.8,
        "token": token,
        "is_demo": False,
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    return await database.insert_one("users", user)


async def create_email_user(
    name: str,
    email: str,
    password: str,
    city: Optional[str],
    role: str,
) -> Dict[str, Any]:
    existing = await find_user_by_email(email)
    timestamp = now_iso()
    token = f"acct_{new_id()}"
    password_record = create_password_record(password)

    if existing:
        updates = {
            "name": name,
            "city": city or existing.get("city", "Harare"),
            "role": role or existing.get("role", "passenger"),
            **password_record,
            "token": token,
            "updated_at": timestamp,
        }
        updated = await database.update_one("users", existing["id"], updates)
        return updated or existing

    user = {
        "id": new_id(),
        "phone": "",
        "email": email.lower().strip(),
        "name": name,
        "city": city or "Harare",
        "role": role,
        "rating": 4.8,
        "token": token,
        **password_record,
        "status": "active",
        "is_demo": False,
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    return await database.insert_one("users", user)


async def verify_email_user(email: str, password: str) -> Optional[Dict[str, Any]]:
    user = await find_user_by_email(email)
    if not user:
        return None
    password_salt = user.get("password_salt")
    password_hash = user.get("password_hash")
    if not password_salt or not password_hash:
        return None
    if password_hash != hash_password(password, password_salt):
        return None

    updated = await database.update_one(
        "users",
        user["id"],
        {"token": f"acct_{new_id()}", "updated_at": now_iso()},
    )
    return updated or user
