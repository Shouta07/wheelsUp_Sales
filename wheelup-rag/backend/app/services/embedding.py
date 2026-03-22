"""テキスト → ベクトル変換 & Qdrant 保存"""

import logging
import uuid

from openai import AsyncOpenAI
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams

from app.core.config import settings

logger = logging.getLogger(__name__)

_openai: AsyncOpenAI | None = None
_qdrant: AsyncQdrantClient | None = None
VECTOR_DIM = 1536  # text-embedding-3-small


def _get_openai() -> AsyncOpenAI:
    global _openai
    if _openai is None:
        _openai = AsyncOpenAI(api_key=settings.openai_api_key)
    return _openai


def _get_qdrant() -> AsyncQdrantClient:
    global _qdrant
    if _qdrant is None:
        _qdrant = AsyncQdrantClient(url=settings.qdrant_url)
    return _qdrant


async def ensure_collection() -> None:
    """Qdrant コレクションが存在しなければ作成する。"""
    client = _get_qdrant()
    collections = await client.get_collections()
    names = [c.name for c in collections.collections]
    if settings.qdrant_collection not in names:
        await client.create_collection(
            collection_name=settings.qdrant_collection,
            vectors_config=VectorParams(size=VECTOR_DIM, distance=Distance.COSINE),
        )
        logger.info("Qdrant コレクション '%s' を作成しました", settings.qdrant_collection)


async def get_embedding(text: str) -> list[float]:
    """テキストを OpenAI Embedding API でベクトル化する。"""
    client = _get_openai()
    response = await client.embeddings.create(
        model=settings.embedding_model,
        input=text,
    )
    return response.data[0].embedding


async def embed_and_store(point_id: str, text: str, payload: dict) -> None:
    """テキストをベクトル化し、Qdrant に保存する。"""
    await ensure_collection()

    vector = await get_embedding(text)
    client = _get_qdrant()

    await client.upsert(
        collection_name=settings.qdrant_collection,
        points=[
            PointStruct(
                id=point_id,
                vector=vector,
                payload=payload,
            )
        ],
    )
    logger.info("Qdrant に保存: %s", point_id)


async def search_similar(query: str, top_k: int = 20, filters: dict | None = None) -> list[dict]:
    """クエリに類似するチャンクを検索する。"""
    await ensure_collection()

    vector = await get_embedding(query)
    client = _get_qdrant()

    # Qdrant フィルタ構築
    query_filter = None
    if filters:
        from qdrant_client.models import FieldCondition, Filter, MatchValue
        conditions = []
        if "chat_type" in filters:
            conditions.append(FieldCondition(key="chat_type", match=MatchValue(value=filters["chat_type"])))
        if "pipedrive_deal_id" in filters:
            conditions.append(FieldCondition(key="pipedrive_deal_id", match=MatchValue(value=filters["pipedrive_deal_id"])))
        if "sender_name" in filters:
            conditions.append(FieldCondition(key="sender_name", match=MatchValue(value=filters["sender_name"])))
        if conditions:
            query_filter = Filter(must=conditions)

    results = await client.search(
        collection_name=settings.qdrant_collection,
        query_vector=vector,
        limit=top_k,
        query_filter=query_filter,
    )

    return [
        {
            "text": hit.payload.get("text", ""),
            "score": hit.score,
            "source": {
                "chat_type": hit.payload.get("chat_type", ""),
                "sender_name": hit.payload.get("sender_name", ""),
                "created_at": hit.payload.get("created_at", ""),
                "chat_name": hit.payload.get("chat_name", ""),
            },
            "entities": hit.payload.get("entities", {}),
            "pipedrive_deal_id": hit.payload.get("pipedrive_deal_id"),
        }
        for hit in results
    ]
