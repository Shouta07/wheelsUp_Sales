"""ハイブリッド検索（Vector + キーワード → RRF マージ）"""

import logging
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chunk import Chunk
from app.models.message import Message
from app.services.embedding import search_similar

logger = logging.getLogger(__name__)


def _rrf_merge(vector_results: list[dict], keyword_results: list[dict], k: int = 60) -> list[dict]:
    """Reciprocal Rank Fusion で2つの検索結果をマージする。"""
    scores: dict[str, float] = {}
    docs: dict[str, dict] = {}

    for rank, doc in enumerate(vector_results):
        doc_key = doc["text"][:100]
        scores[doc_key] = scores.get(doc_key, 0) + 1.0 / (k + rank + 1)
        docs[doc_key] = doc

    for rank, doc in enumerate(keyword_results):
        doc_key = doc["text"][:100]
        scores[doc_key] = scores.get(doc_key, 0) + 1.0 / (k + rank + 1)
        if doc_key not in docs:
            docs[doc_key] = doc

    sorted_keys = sorted(scores.keys(), key=lambda x: scores[x], reverse=True)
    merged = []
    for key in sorted_keys:
        doc = docs[key]
        doc["score"] = scores[key]
        merged.append(doc)

    return merged


async def keyword_search(
    session: AsyncSession, query: str, limit: int = 20, filters: dict | None = None
) -> list[dict]:
    """PostgreSQL 全文検索でチャンクを検索する。"""
    conditions = ["c.chunk_text ILIKE :pattern"]
    params: dict = {"pattern": f"%{query}%", "limit": limit}

    if filters:
        if "chat_type" in filters:
            conditions.append("m.chat_type = :chat_type")
            params["chat_type"] = filters["chat_type"]
        if "pipedrive_deal_id" in filters:
            conditions.append("c.pipedrive_deal_id = :deal_id")
            params["deal_id"] = filters["pipedrive_deal_id"]
        if "sender_name" in filters:
            conditions.append("m.sender_name = :sender_name")
            params["sender_name"] = filters["sender_name"]
        if "date_range" in filters:
            days_map = {"7d": 7, "30d": 30, "90d": 90}
            days = days_map.get(filters["date_range"])
            if days:
                cutoff = datetime.now(timezone.utc) - timedelta(days=days)
                conditions.append("m.created_at >= :cutoff")
                params["cutoff"] = cutoff

    where_clause = " AND ".join(conditions)
    sql = text(f"""
        SELECT c.chunk_text, m.chat_type, m.sender_name, m.created_at, m.chat_name,
               c.entities, c.pipedrive_deal_id
        FROM chunks c
        JOIN messages m ON c.message_id = m.id
        WHERE {where_clause}
        ORDER BY m.created_at DESC
        LIMIT :limit
    """)

    result = await session.execute(sql, params)
    rows = result.fetchall()

    return [
        {
            "text": row[0],
            "score": 0.0,
            "source": {
                "chat_type": row[1],
                "sender_name": row[2],
                "created_at": row[3].isoformat() if row[3] else "",
                "chat_name": row[4] or "",
            },
            "entities": row[5] or {},
            "pipedrive_deal_id": row[6],
        }
        for row in rows
    ]


async def hybrid_search(
    session: AsyncSession,
    query: str,
    top_k: int = 20,
    filters: dict | None = None,
) -> dict:
    """ハイブリッド検索: Vector + キーワード → RRF マージ。"""
    start = time.time()

    # 並列で Vector 検索とキーワード検索を実行
    import asyncio
    vector_task = asyncio.create_task(search_similar(query, top_k=top_k, filters=filters))
    keyword_task = asyncio.create_task(keyword_search(session, query, limit=top_k, filters=filters))

    vector_results, keyword_results = await asyncio.gather(vector_task, keyword_task)

    merged = _rrf_merge(vector_results, keyword_results)[:top_k]

    elapsed_ms = int((time.time() - start) * 1000)

    return {
        "results": merged,
        "total": len(merged),
        "query_time_ms": elapsed_ms,
    }
