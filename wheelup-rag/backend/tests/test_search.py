"""検索エンドポイント テスト"""

import json
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


class TestSearchEndpoint:
    @patch("app.api.search.hybrid_search", new_callable=AsyncMock)
    def test_search_basic(self, mock_search):
        mock_search.return_value = {
            "results": [
                {
                    "text": "テスト結果チャンク",
                    "score": 0.87,
                    "source": {
                        "chat_type": "customer",
                        "sender_name": "田中",
                        "created_at": "2025-01-15T10:30:00Z",
                        "chat_name": "株式会社テスト_商談",
                    },
                    "entities": {"persons": ["田中様"]},
                    "pipedrive_deal_id": 123,
                }
            ],
            "total": 1,
            "query_time_ms": 120,
        }

        resp = client.post("/api/search", json={"query": "テスト"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["results"][0]["text"] == "テスト結果チャンク"

    @patch("app.api.search.hybrid_search", new_callable=AsyncMock)
    def test_search_with_filters(self, mock_search):
        mock_search.return_value = {"results": [], "total": 0, "query_time_ms": 50}

        resp = client.post(
            "/api/search",
            json={
                "query": "テスト",
                "chat_type": "customer",
                "date_range": "30d",
                "top_k": 10,
            },
        )
        assert resp.status_code == 200
        mock_search.assert_called_once()

    @patch("app.api.search.hybrid_search", new_callable=AsyncMock)
    def test_search_empty_query(self, mock_search):
        mock_search.return_value = {"results": [], "total": 0, "query_time_ms": 10}
        resp = client.post("/api/search", json={"query": ""})
        assert resp.status_code == 200
        assert resp.json()["total"] == 0
