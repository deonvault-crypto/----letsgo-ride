from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, Query

from app.auth import get_current_user
from app.database import database
from app.services.conversation_scale_service import (
    list_conversations_for_user_scaled as list_conversations_for_user,
    mark_conversation_read_scaled as mark_conversation_read_service,
)
from app.services.conversation_service import (
    enrich_conversation,
    get_conversation_for_user,
    send_message,
)
from app.utils import api_success


router = APIRouter(prefix="/conversations", tags=["conversations"])


class MessageBody(BaseModel):
    body: str = Field(min_length=1, max_length=1000)


@router.get("")
async def list_conversations(user=Depends(get_current_user)):
    return api_success(await list_conversations_for_user(user))


@router.get("/{conversation_id}")
async def conversation_detail(conversation_id: str, user=Depends(get_current_user)):
    conversation = await get_conversation_for_user(conversation_id, user)
    return api_success(await enrich_conversation(conversation, user))


@router.get("/{conversation_id}/messages")
async def conversation_messages(
    conversation_id: str,
    limit: int = Query(default=100, ge=1, le=100),
    user=Depends(get_current_user),
):
    conversation = await get_conversation_for_user(conversation_id, user)
    messages = await database.find_many(
        "messages",
        {"conversation_id": conversation["id"]},
        sort=[("created_at", -1)],
        limit=limit,
    )
    messages.reverse()
    return api_success(messages)


@router.post("/{conversation_id}/messages")
async def create_message(conversation_id: str, payload: MessageBody, user=Depends(get_current_user)):
    conversation = await get_conversation_for_user(conversation_id, user)
    return api_success(await send_message(conversation, user, payload.body))


@router.post("/{conversation_id}/read")
async def mark_conversation_read(conversation_id: str, user=Depends(get_current_user)):
    conversation = await get_conversation_for_user(conversation_id, user)
    return api_success(await mark_conversation_read_service(conversation, user))
