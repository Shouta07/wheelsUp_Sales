"""既存チャンネル履歴の一括取込スクリプト"""

import asyncio
import json
import logging
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.services.lark_client import get_chat_list, get_chat_messages
from app.queue.producer import enqueue_message

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


async def backfill() -> None:
    """Bot が参加している全チャンネルの履歴を取込む。"""
    page_token = ""
    total_messages = 0

    while True:
        chat_data = await get_chat_list(page_token=page_token)
        chats = chat_data.get("data", {}).get("items", [])

        for chat in chats:
            chat_id = chat.get("chat_id", "")
            chat_name = chat.get("name", "")

            # 個人DM は除外
            if chat.get("chat_mode") == "p2p":
                logger.info("個人DM をスキップ: %s", chat_name)
                continue

            logger.info("チャンネル取込開始: %s (%s)", chat_name, chat_id)
            msg_page_token = ""
            channel_count = 0

            while True:
                msg_data = await get_chat_messages(chat_id, page_token=msg_page_token)
                items = msg_data.get("data", {}).get("items", [])

                for item in items:
                    msg = item.get("body", item)
                    event = {
                        "message": {
                            "message_id": msg.get("message_id", ""),
                            "message_type": msg.get("message_type", ""),
                            "content": msg.get("body", {}).get("content", ""),
                            "chat_id": chat_id,
                            "chat_name": chat_name,
                            "chat_type": msg.get("chat_type", "group"),
                            "create_time": msg.get("create_time", "0"),
                        },
                        "sender": {
                            "sender_id": msg.get("sender", {}),
                        },
                    }
                    await enqueue_message(event)
                    channel_count += 1

                msg_page_token = msg_data.get("data", {}).get("page_token", "")
                if not msg_page_token or not items:
                    break

                await asyncio.sleep(0.2)  # レート制限対策

            logger.info("チャンネル '%s': %d 件取込み", chat_name, channel_count)
            total_messages += channel_count

        page_token = chat_data.get("data", {}).get("page_token", "")
        if not page_token or not chats:
            break

    logger.info("バックフィル完了: 合計 %d 件", total_messages)


if __name__ == "__main__":
    asyncio.run(backfill())
