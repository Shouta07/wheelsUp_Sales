"""Lark API クライアント"""

import logging
import time

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_tenant_access_token: str = ""
_token_expires_at: float = 0

LARK_BASE = "https://open.larksuite.com/open-apis"


async def _get_tenant_token() -> str:
    """Tenant Access Token を取得（期限切れなら自動更新）。"""
    global _tenant_access_token, _token_expires_at

    if _tenant_access_token and time.time() < _token_expires_at:
        return _tenant_access_token

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{LARK_BASE}/auth/v3/tenant_access_token/internal",
            json={
                "app_id": settings.lark_app_id,
                "app_secret": settings.lark_app_secret,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    _tenant_access_token = data["tenant_access_token"]
    _token_expires_at = time.time() + data.get("expire", 7200) - 300  # 5分前にリフレッシュ
    return _tenant_access_token


async def _headers() -> dict:
    token = await _get_tenant_token()
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


async def get_chat_messages(chat_id: str, page_token: str = "", page_size: int = 50) -> dict:
    """チャンネルのメッセージ履歴を取得する（backfill 用）。"""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{LARK_BASE}/im/v1/messages",
            headers=await _headers(),
            params={
                "container_id_type": "chat",
                "container_id": chat_id,
                "page_size": page_size,
                "page_token": page_token,
            },
        )
        resp.raise_for_status()
        return resp.json()


async def get_chat_list(page_token: str = "", page_size: int = 100) -> dict:
    """Bot が参加しているチャット一覧を取得する。"""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{LARK_BASE}/im/v1/chats",
            headers=await _headers(),
            params={"page_size": page_size, "page_token": page_token},
        )
        resp.raise_for_status()
        return resp.json()


async def get_user_info(user_id: str) -> dict:
    """ユーザー情報を取得する。"""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{LARK_BASE}/contact/v3/users/{user_id}",
            headers=await _headers(),
            params={"user_id_type": "user_id"},
        )
        resp.raise_for_status()
        return resp.json().get("data", {}).get("user", {})
