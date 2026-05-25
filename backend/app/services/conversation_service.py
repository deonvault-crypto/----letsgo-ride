from typing import Any, Dict, List, Optional

from app.database import database
from app.services.notification_service import create_app_notification
from app.utils import api_error, new_id, now_iso


def _participant_ids(conversation: Dict[str, Any]) -> set[str]:
    return {conversation.get("driver_user_id"), conversation.get("passenger_id")} - {None, ""}


def can_access_conversation(user: Dict[str, Any], conversation: Dict[str, Any]) -> bool:
    return user.get("role") == "admin" or user.get("id") in _participant_ids(conversation)


async def ensure_conversation_for_request(request: Dict[str, Any], ride: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    existing = await database.find_one("conversations", {"request_id": request["id"]})
    if existing:
        return existing

    ride = ride or await database.find_one("rides", {"id": request.get("ride_id")})
    timestamp = now_iso()
    conversation = {
        "id": new_id(),
        "ride_id": request.get("ride_id"),
        "request_id": request["id"],
        "driver_user_id": ride.get("user_id") if ride else None,
        "driver_id": ride.get("driver_id") if ride else None,
        "passenger_id": request.get("user_id"),
        "status": "active",
        "created_at": timestamp,
        "updated_at": timestamp,
        "last_message_at": None,
    }
    return await database.insert_one("conversations", conversation)


async def list_conversations_for_user(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    conversations = await database.find_many("conversations")
    allowed = [conversation for conversation in conversations if can_access_conversation(user, conversation)]
    return [await enrich_conversation(conversation, user) for conversation in allowed]


async def enrich_conversation(conversation: Dict[str, Any], user: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    enriched = dict(conversation)
    ride = await database.find_one("rides", {"id": conversation.get("ride_id")}) if conversation.get("ride_id") else None
    request = await database.find_one("ride_requests", {"id": conversation.get("request_id")}) if conversation.get("request_id") else None
    driver = await database.find_one("users", {"id": conversation.get("driver_user_id")}) if conversation.get("driver_user_id") else None
    passenger = await database.find_one("users", {"id": conversation.get("passenger_id")}) if conversation.get("passenger_id") else None
    messages = await database.find_many("messages", {"conversation_id": conversation["id"]})
    latest = sorted(messages, key=lambda item: item.get("created_at", ""))[-1] if messages else None
    other_user = passenger if user and user.get("id") == conversation.get("driver_user_id") else driver
    enriched.update(
        {
            "ride": {
                "id": ride.get("id"),
                "origin": ride.get("origin"),
                "destination": ride.get("destination"),
                "date": ride.get("date"),
                "time": ride.get("time"),
            } if ride else None,
            "request_status": request.get("status") if request else None,
            "driver_name": driver.get("name") if driver else None,
            "driver_profile_photo_url": driver.get("profile_photo_url") if driver else None,
            "driver_verification_status": driver.get("verification_status") if driver else None,
            "passenger_name": passenger.get("name") if passenger else request.get("passenger_name") if request else None,
            "passenger_profile_photo_url": passenger.get("profile_photo_url") if passenger else None,
            "passenger_verification_status": passenger.get("verification_status") if passenger else None,
            "other_user_name": other_user.get("name") if other_user else None,
            "other_user_profile_photo_url": other_user.get("profile_photo_url") if other_user else None,
            "last_message": latest.get("body") if latest else None,
            "last_message_at": latest.get("created_at") if latest else conversation.get("last_message_at"),
        }
    )
    return enriched


async def get_conversation_for_user(conversation_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    conversation = await database.find_one("conversations", {"id": conversation_id})
    if not conversation:
        api_error("Conversation not found.", 404)
    if not can_access_conversation(user, conversation):
        api_error("You can only open conversations connected to your trips.", 403)
    return conversation


async def send_message(conversation: Dict[str, Any], sender: Dict[str, Any], body: str) -> Dict[str, Any]:
    cleaned_body = body.strip()
    if not cleaned_body:
        api_error("Message cannot be empty.", 400)
    if len(cleaned_body) > 1000:
        api_error("Message is too long.", 400)

    timestamp = now_iso()
    message = {
        "id": new_id(),
        "conversation_id": conversation["id"],
        "sender_id": sender["id"],
        "body": cleaned_body,
        "created_at": timestamp,
        "read_by_driver": sender["id"] == conversation.get("driver_user_id"),
        "read_by_passenger": sender["id"] == conversation.get("passenger_id"),
        "system": False,
    }
    created = await database.insert_one("messages", message)
    await database.update_one("conversations", conversation["id"], {"last_message_at": timestamp, "updated_at": timestamp})

    recipients = _participant_ids(conversation) - {sender["id"]}
    for recipient_id in recipients:
        title = f"New message from {sender.get('name') or 'LetsGoRide user'}"
        await create_app_notification(
            recipient_id,
            "message",
            title,
            "Open LetsGoRide to reply.",
            {"conversation_id": conversation["id"], "ride_id": conversation.get("ride_id"), "request_id": conversation.get("request_id")},
        )
    return created
