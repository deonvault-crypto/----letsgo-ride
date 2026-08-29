from typing import Any, Dict, List, Optional

from app.database import database
from app.services.notification_service import create_app_notification
from app.services.conversation_realtime_service import (
    conversation_realtime_version,
    insert_versioned_conversation,
    publish_conversation_realtime,
    update_versioned_conversation,
)
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
        "last_message": None,
        "last_message_sender_id": None,
    }
    created = await insert_versioned_conversation(conversation)
    await publish_conversation_realtime(created, "conversation.created")
    return created


async def ensure_conversation_for_hailing_trip(trip: Dict[str, Any]) -> Dict[str, Any]:
    if trip.get("status") == "SEARCHING" or not trip.get("driver_user_id"):
        api_error("Ride Now messaging unlocks after a driver is assigned.", 400)
    existing = await database.find_one("conversations", {"hailing_trip_id": trip["id"]})
    if existing:
        return existing
    timestamp = now_iso()
    conversation = {
        "id": new_id(),
        "hailing_trip_id": trip["id"],
        "driver_user_id": trip.get("driver_user_id"),
        "driver_id": trip.get("driver_id"),
        "passenger_id": trip.get("passenger_user_id"),
        "status": "active",
        "created_at": timestamp,
        "updated_at": timestamp,
        "last_message_at": None,
        "last_message": None,
        "last_message_sender_id": None,
    }
    created = await insert_versioned_conversation(conversation)
    await publish_conversation_realtime(created, "conversation.created")
    return created


async def list_conversations_for_user(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    conversations = await database.find_many("conversations")
    allowed = [conversation for conversation in conversations if can_access_conversation(user, conversation)]
    return [await enrich_conversation(conversation, user) for conversation in allowed]


async def enrich_conversation(conversation: Dict[str, Any], user: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    enriched = dict(conversation)
    ride = await database.find_one("rides", {"id": conversation.get("ride_id")}) if conversation.get("ride_id") else None
    request = await database.find_one("ride_requests", {"id": conversation.get("request_id")}) if conversation.get("request_id") else None
    hailing_trip = await database.find_one("hailing_trips", {"id": conversation.get("hailing_trip_id")}) if conversation.get("hailing_trip_id") else None
    driver = await database.find_one("users", {"id": conversation.get("driver_user_id")}) if conversation.get("driver_user_id") else None
    passenger = await database.find_one("users", {"id": conversation.get("passenger_id")}) if conversation.get("passenger_id") else None
    latest = None
    if "last_message" not in conversation:
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
            } if ride else ({
                "id": hailing_trip.get("id"),
                "origin": (hailing_trip.get("pickup") or {}).get("formatted_address"),
                "destination": (hailing_trip.get("dropoff") or {}).get("formatted_address"),
                "date": str(hailing_trip.get("created_at") or "")[:10],
                "time": None,
                "trip_type": "hailing",
            } if hailing_trip else None),
            "request_status": request.get("status") if request else None,
            "driver_name": driver.get("name") if driver else None,
            "driver_profile_photo_url": driver.get("profile_photo_url") if driver else None,
            "driver_verification_status": driver.get("verification_status") if driver else None,
            "passenger_name": passenger.get("name") if passenger else request.get("passenger_name") if request else None,
            "passenger_profile_photo_url": passenger.get("profile_photo_url") if passenger else None,
            "passenger_verification_status": passenger.get("verification_status") if passenger else None,
            "other_user_name": other_user.get("name") if other_user else None,
            "other_user_profile_photo_url": other_user.get("profile_photo_url") if other_user else None,
            "last_message": latest.get("body") if latest else conversation.get("last_message"),
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
    updated_conversation = await update_versioned_conversation(
        {"id": conversation["id"]},
        {
            "last_message": cleaned_body,
            "last_message_at": timestamp,
            "last_message_sender_id": sender["id"],
            "updated_at": timestamp,
        },
    )
    if not updated_conversation:
        api_error("Conversation not found.", 404)

    recipients = _participant_ids(conversation) - {sender["id"]}
    for recipient_id in recipients:
        title = f"New message from {sender.get('name') or 'LetsGoRide user'}"
        await create_app_notification(
            recipient_id,
            "message",
            title,
            "Open LetsGoRide to reply.",
            {
                "conversation_id": conversation["id"],
                "ride_id": conversation.get("ride_id"),
                "request_id": conversation.get("request_id"),
                "hailing_trip_id": conversation.get("hailing_trip_id"),
                "notification_target": "hailing_trip" if conversation.get("hailing_trip_id") else None,
            },
        )
    await publish_conversation_realtime(
        updated_conversation,
        "conversation.message_created",
        message=created,
    )
    return {
        **created,
        "conversation_realtime_version": conversation_realtime_version(updated_conversation),
    }


async def mark_conversation_read(conversation: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    user_id = str(user.get("id") or "")
    if user_id == conversation.get("driver_user_id"):
        read_field = "read_by_driver"
    elif user_id == conversation.get("passenger_id"):
        read_field = "read_by_passenger"
    else:
        return {
            "read": True,
            "changed": 0,
            "conversation_realtime_version": conversation_realtime_version(conversation),
            "read_through_message_id": None,
        }
    unread = await database.find_many(
        "messages",
        {
            "conversation_id": conversation["id"],
            "sender_id": {"$ne": user_id},
            read_field: {"$ne": True},
        },
    )
    if not unread:
        return {
            "read": True,
            "changed": 0,
            "conversation_realtime_version": conversation_realtime_version(conversation),
            "read_through_message_id": None,
        }

    unread_ids = [str(message["id"]) for message in unread]
    timestamp = now_iso()
    changed = await database.update_many(
        "messages",
        {"id": {"$in": unread_ids}, read_field: {"$ne": True}},
        {read_field: True, "updated_at": timestamp},
    )
    if changed == 0:
        current = await database.find_one("conversations", {"id": conversation["id"]}) or conversation
        return {
            "read": True,
            "changed": 0,
            "conversation_realtime_version": conversation_realtime_version(current),
            "read_through_message_id": None,
        }

    updated_conversation = await update_versioned_conversation(
        {"id": conversation["id"]},
        {"updated_at": timestamp},
    )
    if not updated_conversation:
        api_error("Conversation not found.", 404)
    latest = max(unread, key=lambda item: str(item.get("created_at") or ""))
    read_through_message_id = str(latest.get("id") or "")
    await publish_conversation_realtime(
        updated_conversation,
        "conversation.read_updated",
        reader_user_id=user_id,
        read_through_message_id=read_through_message_id,
    )
    return {
        "read": True,
        "changed": changed,
        "conversation_realtime_version": conversation_realtime_version(updated_conversation),
        "read_through_message_id": read_through_message_id,
    }
