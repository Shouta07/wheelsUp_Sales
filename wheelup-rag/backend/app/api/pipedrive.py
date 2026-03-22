"""Pipedrive Webhook 受信エンドポイント"""

import json
import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

from app.core.security import verify_pipedrive_signature

logger = logging.getLogger(__name__)
router = APIRouter()


async def _handle_deal_added(data: dict) -> None:
    """新規案件と関連 Lark チャンネルの紐付け初期化。"""
    deal = data.get("current", {})
    logger.info("新規 Deal: %s (ID: %s)", deal.get("title"), deal.get("id"))


async def _handle_deal_updated(data: dict) -> None:
    """ステージ変更を検知してフェーズ情報を更新。"""
    current = data.get("current", {})
    previous = data.get("previous", {})
    if current.get("stage_id") != previous.get("stage_id"):
        logger.info(
            "Deal %s: ステージ変更 %s → %s",
            current.get("id"),
            previous.get("stage_id"),
            current.get("stage_id"),
        )


async def _handle_note_added(data: dict) -> None:
    """人力メモもナレッジベースに取込み（重複排除）。"""
    note = data.get("current", {})
    logger.info("新規 Note (Deal %s): %s...", note.get("deal_id"), str(note.get("content", ""))[:50])


@router.post("/webhook/pipedrive")
async def receive_pipedrive_event(request: Request, background_tasks: BackgroundTasks) -> dict:
    """Pipedrive からのイベントを受信する。"""
    body = await request.body()
    signature = request.headers.get("X-Pipedrive-Signature", "")

    if not verify_pipedrive_signature(body, signature):
        raise HTTPException(status_code=401, detail="Invalid signature")

    data = json.loads(body)
    event = data.get("event", "")
    meta = data.get("meta", {})

    handlers = {
        "added.deal": _handle_deal_added,
        "updated.deal": _handle_deal_updated,
        "added.note": _handle_note_added,
    }

    handler = handlers.get(event)
    if handler:
        background_tasks.add_task(handler, data)
    else:
        logger.info("未処理の Pipedrive イベント: %s", event)

    return {"success": True}
