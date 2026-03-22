"""RAG 検索エンドポイント"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.rag_search import hybrid_search

router = APIRouter()


class SearchRequest(BaseModel):
    query: str
    top_k: int = 20
    chat_type: str | None = None
    date_range: str | None = None  # 7d / 30d / 90d / all
    pipedrive_deal_id: int | None = None
    sender_name: str | None = None


@router.post("/api/search")
async def search(req: SearchRequest, session: AsyncSession = Depends(get_db)) -> dict:
    """ハイブリッド検索を実行する。"""
    filters = {}
    if req.chat_type:
        filters["chat_type"] = req.chat_type
    if req.date_range and req.date_range != "all":
        filters["date_range"] = req.date_range
    if req.pipedrive_deal_id:
        filters["pipedrive_deal_id"] = req.pipedrive_deal_id
    if req.sender_name:
        filters["sender_name"] = req.sender_name

    result = await hybrid_search(session, req.query, top_k=req.top_k, filters=filters or None)
    return result
