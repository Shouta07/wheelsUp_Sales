"""商談後サマリー生成エンドポイント"""

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.summary_generator import generate_summary, save_summary_to_pipedrive

router = APIRouter()


class SummaryRequest(BaseModel):
    meeting_notes: str
    duration_minutes: int = 60
    attendees: list[str] = []


@router.post("/api/summary/{deal_id}")
async def create_summary(deal_id: int, req: SummaryRequest) -> dict:
    """商談メモからサマリーを生成する。"""
    content = await generate_summary(
        deal_id=deal_id,
        meeting_notes=req.meeting_notes,
        duration_minutes=req.duration_minutes,
        attendees=req.attendees or None,
    )
    return {"deal_id": deal_id, "summary": content}


@router.post("/api/summary/{deal_id}/save")
async def save_summary(deal_id: int, req: SummaryRequest) -> dict:
    """サマリーを生成し Pipedrive に保存する。"""
    content = await generate_summary(
        deal_id=deal_id,
        meeting_notes=req.meeting_notes,
        duration_minutes=req.duration_minutes,
        attendees=req.attendees or None,
    )
    note = await save_summary_to_pipedrive(deal_id, content)
    return {"deal_id": deal_id, "summary": content, "pipedrive_note_id": note.get("id")}
