"""Pipedrive API クライアント テスト"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

import httpx


class TestPipedriveClient:
    @pytest.mark.asyncio
    @patch("app.services.pipedrive_client.httpx.AsyncClient")
    async def test_get_deal(self, mock_client_cls):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {
            "data": {"id": 1, "title": "テスト案件", "stage_id": 1}
        }

        mock_client = AsyncMock()
        mock_client.request = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client_cls.return_value = mock_client

        from app.services.pipedrive_client import get_deal
        result = await get_deal(1)
        assert result["id"] == 1
        assert result["title"] == "テスト案件"

    @pytest.mark.asyncio
    @patch("app.services.pipedrive_client.httpx.AsyncClient")
    async def test_get_person(self, mock_client_cls):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {
            "data": {"id": 10, "name": "田中太郎"}
        }

        mock_client = AsyncMock()
        mock_client.request = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client_cls.return_value = mock_client

        from app.services.pipedrive_client import get_person
        result = await get_person(10)
        assert result["name"] == "田中太郎"

    @pytest.mark.asyncio
    @patch("app.services.pipedrive_client.httpx.AsyncClient")
    async def test_add_note(self, mock_client_cls):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {
            "data": {"id": 100, "deal_id": 1, "content": "テストメモ"}
        }

        mock_client = AsyncMock()
        mock_client.request = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client_cls.return_value = mock_client

        from app.services.pipedrive_client import add_note
        result = await add_note(1, "テストメモ")
        assert result["id"] == 100

    @pytest.mark.asyncio
    @patch("app.services.pipedrive_client.httpx.AsyncClient")
    async def test_get_deal_activities(self, mock_client_cls):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {
            "data": [
                {"id": 1, "subject": "フォロー電話", "type": "call"},
                {"id": 2, "subject": "提案書送付", "type": "task"},
            ]
        }

        mock_client = AsyncMock()
        mock_client.request = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client_cls.return_value = mock_client

        from app.services.pipedrive_client import get_deal_activities
        result = await get_deal_activities(1)
        assert len(result) == 2
