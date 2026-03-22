"""Lark Webhook テスト"""

import hashlib
import hmac
import json
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _make_signature(body: bytes, key: str = "") -> str:
    if not key:
        return ""
    return hmac.new(key.encode(), body, hashlib.sha256).hexdigest()


class TestLarkWebhook:
    def test_url_verification(self):
        payload = {"type": "url_verification", "challenge": "test_challenge_token"}
        body = json.dumps(payload).encode()

        with patch("app.core.config.settings") as mock_settings:
            mock_settings.lark_encrypt_key = ""
            resp = client.post("/webhook/lark", content=body)

        assert resp.status_code == 200
        assert resp.json()["challenge"] == "test_challenge_token"

    def test_invalid_signature_rejected(self):
        payload = {"header": {"event_type": "im.message.receive_v1"}, "event": {}}
        body = json.dumps(payload).encode()

        with patch("app.api.webhook_lark.verify_lark_signature", return_value=False):
            resp = client.post(
                "/webhook/lark",
                content=body,
                headers={"X-Lark-Signature": "invalid"},
            )

        assert resp.status_code == 401

    @patch("app.api.webhook_lark.enqueue_message", new_callable=AsyncMock)
    def test_message_event_enqueued(self, mock_enqueue):
        payload = {
            "header": {"event_type": "im.message.receive_v1"},
            "event": {
                "message": {
                    "message_id": "msg_test_001",
                    "message_type": "text",
                    "chat_type": "group",
                    "content": json.dumps({"text": "テストメッセージ"}),
                },
            },
        }
        body = json.dumps(payload).encode()

        with patch("app.api.webhook_lark.verify_lark_signature", return_value=True):
            resp = client.post("/webhook/lark", content=body)

        assert resp.status_code == 200
        assert resp.json()["code"] == 0

    def test_dm_excluded(self):
        payload = {
            "header": {"event_type": "im.message.receive_v1"},
            "event": {
                "message": {
                    "message_id": "msg_dm_001",
                    "chat_type": "p2p",
                    "content": json.dumps({"text": "DM"}),
                },
            },
        }
        body = json.dumps(payload).encode()

        with patch("app.api.webhook_lark.verify_lark_signature", return_value=True):
            resp = client.post("/webhook/lark", content=body)

        assert resp.status_code == 200

    def test_non_message_event_ignored(self):
        payload = {
            "header": {"event_type": "other.event.type"},
            "event": {},
        }
        body = json.dumps(payload).encode()

        with patch("app.api.webhook_lark.verify_lark_signature", return_value=True):
            resp = client.post("/webhook/lark", content=body)

        assert resp.status_code == 200
        assert resp.json()["code"] == 0
