"""Redis キュー投入"""

import json
import logging

import redis.asyncio as redis

from app.core.config import settings

logger = logging.getLogger(__name__)

_redis: redis.Redis | None = None
QUEUE_NAME = "lark_messages"


async def get_redis() -> redis.Redis:
    """Redis 接続を取得（シングルトン）。"""
    global _redis
    if _redis is None:
        _redis = redis.from_url(settings.redis_url, decode_responses=True)
    return _redis


async def enqueue_message(event: dict) -> None:
    """Lark イベントを Redis キューに投入する。"""
    r = await get_redis()
    await r.rpush(QUEUE_NAME, json.dumps(event, ensure_ascii=False))
    logger.info("Enqueued message: %s", event.get("message", {}).get("message_id", "unknown"))


async def close_redis() -> None:
    """Redis 接続を閉じる。"""
    global _redis
    if _redis is not None:
        await _redis.close()
        _redis = None
