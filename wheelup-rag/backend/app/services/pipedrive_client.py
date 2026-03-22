"""Pipedrive API クライアント"""

import asyncio
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

PIPEDRIVE_BASE = "https://api.pipedrive.com/v1"
MAX_RETRIES = 3


async def _request(method: str, path: str, **kwargs) -> dict:
    """Pipedrive API リクエスト（レート制限時は指数バックオフでリトライ）。"""
    url = f"{PIPEDRIVE_BASE}{path}"
    params = kwargs.pop("params", {})
    params["api_token"] = settings.pipedrive_api_token

    for attempt in range(MAX_RETRIES):
        async with httpx.AsyncClient() as client:
            resp = await client.request(method, url, params=params, **kwargs)

            if resp.status_code == 429:
                wait = 2 ** (attempt + 1)
                logger.warning("Pipedrive レート制限。%d秒後にリトライ (%d/%d)", wait, attempt + 1, MAX_RETRIES)
                await asyncio.sleep(wait)
                continue

            resp.raise_for_status()
            return resp.json()

    raise httpx.HTTPStatusError("レート制限リトライ超過", request=None, response=resp)


async def get_deal(deal_id: int) -> dict:
    """案件情報取得 — 商談前のコンテキスト収集に使用。"""
    data = await _request("GET", f"/deals/{deal_id}")
    return data.get("data", {})


async def get_person(person_id: int) -> dict:
    """担当者情報取得 — 人物DBの補完に使用。"""
    data = await _request("GET", f"/persons/{person_id}")
    return data.get("data", {})


async def get_organization(org_id: int) -> dict:
    """会社情報取得 — 企業解像度向上に使用。"""
    data = await _request("GET", f"/organizations/{org_id}")
    return data.get("data", {})


async def get_deal_activities(deal_id: int) -> list:
    """過去のアクティビティ一覧 — 商談履歴把握に使用。"""
    data = await _request("GET", f"/deals/{deal_id}/activities")
    return data.get("data", []) or []


async def add_note(deal_id: int, content: str, pinned: bool = True) -> dict:
    """メモ追加 — 商談後の情報管理簡素化に使用。"""
    data = await _request(
        "POST",
        "/notes",
        json={
            "deal_id": deal_id,
            "content": content,
            "pinned_to_deal_flag": 1 if pinned else 0,
        },
    )
    return data.get("data", {})


async def create_activity(deal_id: int, subject: str, due_date: str, note: str) -> dict:
    """アクティビティ作成 — ネクストアクション登録・企業アプローチ効率化に使用。"""
    data = await _request(
        "POST",
        "/activities",
        json={
            "deal_id": deal_id,
            "subject": subject,
            "due_date": due_date,
            "note": note,
            "type": "task",
        },
    )
    return data.get("data", {})


async def update_deal_stage(deal_id: int, stage_id: int) -> dict:
    """案件ステージ更新。"""
    data = await _request(
        "PUT",
        f"/deals/{deal_id}",
        json={"stage_id": stage_id},
    )
    return data.get("data", {})
