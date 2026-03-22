"""Lark Webhook 署名検証"""

import hashlib
import hmac

from app.core.config import settings


def verify_lark_signature(body: bytes, signature: str) -> bool:
    """X-Lark-Signature ヘッダーの HMAC-SHA256 署名を検証する。

    Lark の署名計算:
      SHA256(timestamp + nonce + encrypt_key + body)
    ただし Webhook v2 では body 全体を encrypt_key で HMAC-SHA256。
    """
    if not settings.lark_encrypt_key:
        return True  # 開発中で encrypt_key 未設定の場合はスキップ

    expected = hmac.new(
        settings.lark_encrypt_key.encode("utf-8"),
        body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


def verify_pipedrive_signature(body: bytes, signature: str) -> bool:
    """Pipedrive Webhook の署名を検証する。"""
    if not settings.pipedrive_webhook_secret:
        return True

    expected = hmac.new(
        settings.pipedrive_webhook_secret.encode("utf-8"),
        body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)
