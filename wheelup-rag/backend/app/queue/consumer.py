"""キュー消費ワーカー — Lark メッセージを処理してベクトル化する"""

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone

import redis.asyncio as redis
from sqlalchemy import select

from app.core.config import settings
from app.core.database import async_session
from app.models.message import Message
from app.models.chunk import Chunk
from app.services.text_processor import process_text
from app.services.embedding import embed_and_store

logger = logging.getLogger(__name__)

QUEUE_NAME = "lark_messages"


def _classify_channel(chat_name: str) -> str:
    """チャンネル名から種別を推定する。"""
    if not chat_name:
        return "internal"
    name = chat_name.lower()
    if any(k in name for k in ["製品", "product", "プロダクト"]):
        return "product"
    if any(k in name for k in ["顧客", "customer", "クライアント", "商談"]):
        return "customer"
    if any(k in name for k in ["アナウンス", "announce", "お知らせ", "全体"]):
        return "announce"
    return "internal"


async def process_event(event: dict) -> None:
    """1件の Lark イベントを処理する。"""
    msg_data = event.get("message", {})
    msg_id = msg_data.get("message_id", "")
    if not msg_id:
        logger.warning("message_id が空のイベントをスキップ")
        return

    # べき等性チェック
    async with async_session() as session:
        existing = await session.execute(
            select(Message).where(Message.lark_message_id == msg_id)
        )
        if existing.scalar_one_or_none():
            logger.info("重複メッセージをスキップ: %s", msg_id)
            return

    # メッセージ本文を取得
    content = ""
    msg_type = msg_data.get("message_type", "")
    if msg_type == "text":
        try:
            content = json.loads(msg_data.get("content", "{}")).get("text", "")
        except json.JSONDecodeError:
            content = msg_data.get("content", "")
    else:
        logger.info("テキスト以外のメッセージタイプをスキップ: %s", msg_type)
        return

    if not content.strip():
        return

    chat_id = msg_data.get("chat_id", "")
    chat_name = event.get("message", {}).get("chat_name", "")
    chat_type = _classify_channel(chat_name)

    # DM は除外（セキュリティ要件）
    if msg_data.get("chat_type") == "p2p":
        logger.info("個人DMを除外: %s", msg_id)
        return

    sender = event.get("sender", {})
    sender_id = sender.get("sender_id", {}).get("user_id", "")
    sender_name = sender.get("sender_id", {}).get("name", "")

    created_at_ms = int(msg_data.get("create_time", "0"))
    created_at = datetime.fromtimestamp(created_at_ms / 1000, tz=timezone.utc) if created_at_ms else datetime.now(timezone.utc)

    # テキスト処理 → チャンキング → エンティティ抽出
    chunks_data = process_text(content)

    # DB 保存
    async with async_session() as session:
        message = Message(
            lark_message_id=msg_id,
            chat_id=chat_id,
            chat_name=chat_name,
            chat_type=chat_type,
            sender_id=sender_id,
            sender_name=sender_name,
            content=content,
            created_at=created_at,
        )
        session.add(message)
        await session.flush()

        for i, chunk_info in enumerate(chunks_data):
            point_id = uuid.uuid4()
            chunk = Chunk(
                message_id=message.id,
                chunk_text=chunk_info["text"],
                chunk_index=i,
                entities=chunk_info.get("entities", {}),
                qdrant_point_id=point_id,
            )
            session.add(chunk)

            # Qdrant にベクトル保存
            await embed_and_store(
                point_id=str(point_id),
                text=chunk_info["text"],
                payload={
                    "text": chunk_info["text"],
                    "message_id": msg_id,
                    "chat_id": chat_id,
                    "chat_type": chat_type,
                    "sender_id": sender_id,
                    "sender_name": sender_name,
                    "created_at": created_at.isoformat(),
                    "entities": chunk_info.get("entities", {}),
                    "pipedrive_deal_id": None,
                },
            )

        await session.commit()
        logger.info("メッセージ処理完了: %s (%d チャンク)", msg_id, len(chunks_data))


async def run_consumer() -> None:
    """Redis キューからメッセージを消費し続けるワーカーループ。"""
    r = redis.from_url(settings.redis_url, decode_responses=True)
    logger.info("Consumer started, listening on queue: %s", QUEUE_NAME)

    try:
        while True:
            result = await r.blpop(QUEUE_NAME, timeout=5)
            if result is None:
                continue
            _, raw = result
            try:
                event = json.loads(raw)
                await process_event(event)
            except Exception:
                logger.exception("イベント処理中にエラー")
    finally:
        await r.close()


if __name__ == "__main__":
    asyncio.run(run_consumer())
