"""候補者管理 API — 面談前準備・面談中サポート・商談後フォローアップ"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.core.config import settings
from app.core.database import async_session
from app.models.candidate import Candidate, CandidateStatus, FollowUpPriority
from app.services.candidate_briefing import generate_candidate_briefing

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/candidates")


# ---------- Schemas ---------- #

class CandidateCreate(BaseModel):
    """候補者登録リクエスト。"""

    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    age: Optional[int] = None
    current_company: Optional[str] = None
    current_position: Optional[str] = None
    current_industry: Optional[str] = None
    years_of_experience: Optional[int] = None
    current_salary: Optional[int] = None
    qualifications: list[str] = []
    desired_keywords: list[str] = []
    desired_salary: Optional[int] = None
    desired_location: Optional[str] = None
    desired_position: Optional[str] = None
    pipedrive_person_id: Optional[int] = None
    pipedrive_deal_id: Optional[int] = None


class CandidateUpdate(BaseModel):
    """候補者更新リクエスト。"""

    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    age: Optional[int] = None
    current_company: Optional[str] = None
    current_position: Optional[str] = None
    current_industry: Optional[str] = None
    years_of_experience: Optional[int] = None
    current_salary: Optional[int] = None
    qualifications: Optional[list[str]] = None
    desired_keywords: Optional[list[str]] = None
    desired_salary: Optional[int] = None
    desired_location: Optional[str] = None
    desired_position: Optional[str] = None
    status: Optional[str] = None
    meeting_notes: Optional[str] = None
    follow_up_date: Optional[str] = None
    follow_up_priority: Optional[str] = None
    follow_up_notes: Optional[str] = None


class ActionEntry(BaseModel):
    """アクション履歴エントリ。"""

    action: str
    result: Optional[str] = None


class CandidateOut(BaseModel):
    """候補者レスポンス。"""

    id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    age: Optional[int] = None
    current_company: Optional[str] = None
    current_position: Optional[str] = None
    current_industry: Optional[str] = None
    years_of_experience: Optional[int] = None
    current_salary: Optional[int] = None
    qualifications: list[str] = []
    desired_keywords: list[str] = []
    desired_salary: Optional[int] = None
    desired_location: Optional[str] = None
    desired_position: Optional[str] = None
    inferred_needs: dict = {}
    matched_companies: list = []
    meeting_notes: Optional[str] = None
    status: str = "new"
    follow_up_date: Optional[str] = None
    follow_up_priority: str = "medium"
    follow_up_notes: Optional[str] = None
    last_contact_date: Optional[str] = None
    days_since_contact: int = 0
    action_history: list = []
    pipedrive_person_id: Optional[int] = None
    pipedrive_deal_id: Optional[int] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class CandidateListResponse(BaseModel):
    """候補者一覧レスポンス。"""

    candidates: list[CandidateOut]
    total: int


class BriefingResponse(BaseModel):
    """ブリーフィングレスポンス。"""

    candidate_id: str
    briefing: str
    matched_companies: list
    inferred_needs: dict


class MeetingNotesSave(BaseModel):
    """面談メモ保存リクエスト。"""

    notes: str
    keywords_discovered: list[str] = []


class FollowUpAction(BaseModel):
    """フォローアップアクション更新。"""

    status: Optional[str] = None
    follow_up_date: Optional[str] = None
    follow_up_priority: Optional[str] = None
    follow_up_notes: Optional[str] = None


# ---------- Helpers ---------- #

def _to_out(c: Candidate) -> CandidateOut:
    """Candidate ORM → CandidateOut。"""
    return CandidateOut(
        id=str(c.id),
        name=c.name,
        email=c.email,
        phone=c.phone,
        age=c.age,
        current_company=c.current_company,
        current_position=c.current_position,
        current_industry=c.current_industry,
        years_of_experience=c.years_of_experience,
        current_salary=c.current_salary,
        qualifications=c.qualifications or [],
        desired_keywords=c.desired_keywords or [],
        desired_salary=c.desired_salary,
        desired_location=c.desired_location,
        desired_position=c.desired_position,
        inferred_needs=c.inferred_needs or {},
        matched_companies=c.matched_companies or [],
        meeting_notes=c.meeting_notes,
        status=c.status.value if c.status else "new",
        follow_up_date=c.follow_up_date.isoformat() if c.follow_up_date else None,
        follow_up_priority=c.follow_up_priority.value if c.follow_up_priority else "medium",
        follow_up_notes=c.follow_up_notes,
        last_contact_date=c.last_contact_date.isoformat() if c.last_contact_date else None,
        days_since_contact=c.days_since_contact or 0,
        action_history=c.action_history or [],
        pipedrive_person_id=c.pipedrive_person_id,
        pipedrive_deal_id=c.pipedrive_deal_id,
        created_at=c.created_at.isoformat() if c.created_at else None,
        updated_at=c.updated_at.isoformat() if c.updated_at else None,
    )


# ---------- Endpoints ---------- #

@router.get("", response_model=CandidateListResponse)
async def list_candidates(
    status: Optional[str] = None,
    q: Optional[str] = None,
    follow_up_due: Optional[bool] = None,
) -> CandidateListResponse:
    """候補者一覧。ステータス・名前・フォロー期限でフィルタ可能。"""
    async with async_session() as session:
        stmt = select(Candidate).order_by(Candidate.updated_at.desc())

        if status:
            stmt = stmt.where(Candidate.status == status)

        if q:
            stmt = stmt.where(
                Candidate.name.ilike(f"%{q}%")
                | Candidate.current_company.ilike(f"%{q}%")
            )

        if follow_up_due:
            now = datetime.now(timezone.utc)
            stmt = stmt.where(
                Candidate.follow_up_date <= now,
                Candidate.status.notin_([CandidateStatus.placed, CandidateStatus.lost]),
            )

        result = await session.execute(stmt)
        candidates = result.scalars().all()

        # days_since_contact を更新
        now = datetime.now(timezone.utc)
        items = []
        for c in candidates:
            if c.last_contact_date:
                c.days_since_contact = (now - c.last_contact_date).days
            items.append(_to_out(c))

        return CandidateListResponse(candidates=items, total=len(items))


@router.post("", response_model=CandidateOut)
async def create_candidate(body: CandidateCreate) -> CandidateOut:
    """候補者を新規登録する。"""
    async with async_session() as session:
        candidate = Candidate(
            name=body.name,
            email=body.email,
            phone=body.phone,
            age=body.age,
            current_company=body.current_company,
            current_position=body.current_position,
            current_industry=body.current_industry,
            years_of_experience=body.years_of_experience,
            current_salary=body.current_salary,
            qualifications=body.qualifications,
            desired_keywords=body.desired_keywords,
            desired_salary=body.desired_salary,
            desired_location=body.desired_location,
            desired_position=body.desired_position,
            pipedrive_person_id=body.pipedrive_person_id,
            pipedrive_deal_id=body.pipedrive_deal_id,
        )
        session.add(candidate)
        await session.commit()
        await session.refresh(candidate)
        return _to_out(candidate)


@router.get("/{candidate_id}", response_model=CandidateOut)
async def get_candidate(candidate_id: str) -> CandidateOut:
    """候補者詳細を取得する。"""
    async with async_session() as session:
        result = await session.execute(
            select(Candidate).where(Candidate.id == candidate_id)
        )
        c = result.scalar_one_or_none()
        if not c:
            raise HTTPException(status_code=404, detail="候補者が見つかりません")
        return _to_out(c)


@router.put("/{candidate_id}", response_model=CandidateOut)
async def update_candidate(candidate_id: str, body: CandidateUpdate) -> CandidateOut:
    """候補者情報を更新する。"""
    async with async_session() as session:
        result = await session.execute(
            select(Candidate).where(Candidate.id == candidate_id)
        )
        c = result.scalar_one_or_none()
        if not c:
            raise HTTPException(status_code=404, detail="候補者が見つかりません")

        for field, value in body.model_dump(exclude_unset=True).items():
            if field == "status" and value:
                setattr(c, field, CandidateStatus(value))
            elif field == "follow_up_priority" and value:
                setattr(c, field, FollowUpPriority(value))
            elif field == "follow_up_date" and value:
                setattr(c, field, datetime.fromisoformat(value))
            else:
                setattr(c, field, value)

        await session.commit()
        await session.refresh(c)
        return _to_out(c)


@router.post("/{candidate_id}/briefing", response_model=BriefingResponse)
async def get_briefing(candidate_id: str) -> BriefingResponse:
    """候補者の面談前ブリーフィングをAI生成する。"""
    result = await generate_candidate_briefing(candidate_id)
    return BriefingResponse(
        candidate_id=candidate_id,
        briefing=result["briefing"],
        matched_companies=result["matched_companies"],
        inferred_needs=result["inferred_needs"],
    )


@router.post("/{candidate_id}/meeting-notes", response_model=CandidateOut)
async def save_meeting_notes(candidate_id: str, body: MeetingNotesSave) -> CandidateOut:
    """面談中のメモを保存し、発見したキーワードを希望条件に追加する。"""
    async with async_session() as session:
        result = await session.execute(
            select(Candidate).where(Candidate.id == candidate_id)
        )
        c = result.scalar_one_or_none()
        if not c:
            raise HTTPException(status_code=404, detail="候補者が見つかりません")

        c.meeting_notes = body.notes
        c.last_contact_date = datetime.now(timezone.utc)
        c.status = CandidateStatus.in_progress

        # 面談で発見した新キーワードを追加
        if body.keywords_discovered:
            existing = set(c.desired_keywords or [])
            existing.update(body.keywords_discovered)
            c.desired_keywords = list(existing)

        # アクション履歴に追加
        history = c.action_history or []
        history.append({
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "action": "面談実施",
            "result": f"メモ {len(body.notes)}文字記録",
        })
        c.action_history = history

        await session.commit()
        await session.refresh(c)
        return _to_out(c)


@router.post("/{candidate_id}/action", response_model=CandidateOut)
async def add_action(candidate_id: str, body: ActionEntry) -> CandidateOut:
    """アクション履歴を追加する。"""
    async with async_session() as session:
        result = await session.execute(
            select(Candidate).where(Candidate.id == candidate_id)
        )
        c = result.scalar_one_or_none()
        if not c:
            raise HTTPException(status_code=404, detail="候補者が見つかりません")

        history = c.action_history or []
        history.append({
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "action": body.action,
            "result": body.result or "",
        })
        c.action_history = history
        c.last_contact_date = datetime.now(timezone.utc)

        await session.commit()
        await session.refresh(c)
        return _to_out(c)


@router.put("/{candidate_id}/follow-up", response_model=CandidateOut)
async def update_follow_up(candidate_id: str, body: FollowUpAction) -> CandidateOut:
    """フォローアップ情報を更新する。"""
    async with async_session() as session:
        result = await session.execute(
            select(Candidate).where(Candidate.id == candidate_id)
        )
        c = result.scalar_one_or_none()
        if not c:
            raise HTTPException(status_code=404, detail="候補者が見つかりません")

        if body.status:
            c.status = CandidateStatus(body.status)
        if body.follow_up_date:
            c.follow_up_date = datetime.fromisoformat(body.follow_up_date)
        if body.follow_up_priority:
            c.follow_up_priority = FollowUpPriority(body.follow_up_priority)
        if body.follow_up_notes is not None:
            c.follow_up_notes = body.follow_up_notes

        await session.commit()
        await session.refresh(c)
        return _to_out(c)
