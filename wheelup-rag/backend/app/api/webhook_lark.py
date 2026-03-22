"""Lark Webhook 受信エンドポイント"""

import json
import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

from app.core.security import verify_lark_signature
from app.queue.producer import enqueue_message

logger = logging.getLogger(__name__)
router = APIRouter()

# 処理済みメッセージ ID のインメモリキャッシュ（べき等性保証）
_processed_ids: set[str] = set()
_MAX_CACHE_SIZE = 10_000


@router.post("/webhook/lark")
async def receive_lark_event(request: Request, background_tasks: BackgroundTasks) -> dict:
    """Lark からのイベントを受信する。

    - 署名検証を実施
    - URL verification チャレンジに応答
    - メッセージは 200ms 以内に応答し、処理はバックグラウンドで実行
    """
    body = await request.body()
    signature = request.headers.get("X-Lark-Signature", "")

    if not verify_lark_signature(body, signature):
        logger.warning("署名検証失敗")
        raise HTTPException(status_code=401, detail="Invalid signature")

    data = json.loads(body)

    # URL verification チャレンジ
    if data.get("type") == "url_verification":
        return {"challenge": data["challenge"]}

    # Schema v2 のヘッダー情報
    header = data.get("header", {})
    event_type = header.get("event_type", "")

    if event_type != "im.message.receive_v1":
        logger.info("対象外のイベントタイプ: %s", event_type)
        return {"code": 0}

    event = data.get("event", {})
    msg = event.get("message", {})
    msg_id = msg.get("message_id", "")

    # べき等性チェック
    if msg_id in _processed_ids:
        logger.info("重複イベントをスキップ: %s", msg_id)
        return {"code": 0}

    # 個人DM は除外
    if msg.get("chat_type") == "p2p":
        logger.info("個人DMを除外: %s", msg_id)
        return {"code": 0}

    # キャッシュ管理
    if len(_processed_ids) >= _MAX_CACHE_SIZE:
        _processed_ids.clear()
    _processed_ids.add(msg_id)

    # 非同期でキューに投入（200ms 以内に応答するため）
    background_tasks.add_task(enqueue_message, event)

    return {"code": 0}
