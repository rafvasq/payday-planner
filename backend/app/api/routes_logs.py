from fastapi import APIRouter
from pydantic import BaseModel
import logging
from typing import Optional, Any

router = APIRouter()
logger = logging.getLogger("payday.frontend")

class LogMessage(BaseModel):
    level: str
    message: str
    data: Optional[Any] = None

@router.post("/log")
async def receive_frontend_log(log: LogMessage):
    msg = f"Frontend [{log.level.upper()}]: {log.message} | Data: {log.data}"
    if log.level == 'error':
        logger.error(msg)
    elif log.level == 'warn':
        logger.warning(msg)
    else:
        logger.info(msg)
    return {"status": "logged"}
