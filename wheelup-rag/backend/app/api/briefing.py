"""商談前ブリーフィング生成エンドポイント"""

from fastapi import APIRouter

from app.services.briefing_generator import generate_briefing

router = APIRouter()


@router.post("/api/briefing/{deal_id}")
async def create_briefing(deal_id: int) -> dict:
    """Pipedrive Deal ID を指定してブリーフィングを生成する。"""
    content = await generate_briefing(deal_id)
    return {"deal_id": deal_id, "briefing": content}
