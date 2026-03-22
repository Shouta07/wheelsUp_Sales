"""DB スキーマ初期化スクリプト"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.core.database import engine, Base
from app.models.message import Message  # noqa: F401
from app.models.chunk import Chunk  # noqa: F401
from app.models.person import Person, ChannelDealMapping  # noqa: F401


async def init() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("DB スキーマを作成しました。")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(init())
