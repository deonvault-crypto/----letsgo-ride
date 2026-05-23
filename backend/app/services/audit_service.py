from typing import Any, Dict, Optional

from app.database import database
from app.utils import new_id, now_iso


async def write_audit_log(
    *,
    actor_user_id: Optional[str],
    actor_role: Optional[str],
    action: str,
    target_type: str,
    target_id: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    log = {
        "id": new_id(),
        "actor_user_id": actor_user_id,
        "actor_role": actor_role,
        "action": action,
        "target_type": target_type,
        "target_id": target_id,
        "metadata": metadata or {},
        "created_at": now_iso(),
    }
    return await database.insert_one("audit_logs", log)
