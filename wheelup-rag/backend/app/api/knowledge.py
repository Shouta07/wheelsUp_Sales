"""建設業界ナレッジ API — SEO(Sales Enablement Office)基盤"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.core.database import async_session
from app.models.knowledge import IndustryCategory, Qualification, LearningProgress
from app.services.knowledge_seed import seed_industry_knowledge

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/knowledge")


# ---------- Schemas ---------- #

class CategoryOut(BaseModel):
    id: str
    parent_id: Optional[str] = None
    name: str
    slug: str
    level: int
    description: Optional[str] = None
    market_overview: Optional[str] = None
    key_players: list[str] = []
    typical_roles: list[str] = []
    required_qualifications: list[str] = []
    salary_range: Optional[str] = None
    growth_trend: Optional[str] = None
    selling_points: list = []
    pain_points: list = []
    talking_tips: Optional[str] = None
    sort_order: int = 0


class QualificationOut(BaseModel):
    id: str
    name: str
    category: Optional[str] = None
    field: Optional[str] = None
    difficulty: Optional[str] = None
    description: Optional[str] = None
    market_value: Optional[str] = None
    salary_impact: Optional[str] = None
    related_roles: list[str] = []
    exam_info: Optional[str] = None
    tips_for_consultant: Optional[str] = None


class TaxonomyResponse(BaseModel):
    """業界構造ツリー。"""
    categories: list[CategoryOut]
    total: int


class QualificationListResponse(BaseModel):
    qualifications: list[QualificationOut]
    total: int


class ProgressEntry(BaseModel):
    user_name: str
    category_id: Optional[str] = None
    qualification_id: Optional[str] = None
    completed: bool = True
    quiz_score: Optional[int] = None


class ProgressOut(BaseModel):
    id: str
    user_name: str
    category_id: Optional[str] = None
    qualification_id: Optional[str] = None
    completed: bool
    quiz_score: Optional[int] = None
    studied_at: Optional[str] = None


class SeedResponse(BaseModel):
    categories: int
    qualifications: int
    status: str


# ---------- Helpers ---------- #

def _cat_out(c: IndustryCategory) -> CategoryOut:
    return CategoryOut(
        id=str(c.id),
        parent_id=str(c.parent_id) if c.parent_id else None,
        name=c.name,
        slug=c.slug,
        level=c.level,
        description=c.description,
        market_overview=c.market_overview,
        key_players=c.key_players or [],
        typical_roles=c.typical_roles or [],
        required_qualifications=c.required_qualifications or [],
        salary_range=c.salary_range,
        growth_trend=c.growth_trend,
        selling_points=c.selling_points or [],
        pain_points=c.pain_points or [],
        talking_tips=c.talking_tips,
        sort_order=c.sort_order,
    )


def _qual_out(q: Qualification) -> QualificationOut:
    return QualificationOut(
        id=str(q.id),
        name=q.name,
        category=q.category,
        field=q.field,
        difficulty=q.difficulty,
        description=q.description,
        market_value=q.market_value,
        salary_impact=q.salary_impact,
        related_roles=q.related_roles or [],
        exam_info=q.exam_info,
        tips_for_consultant=q.tips_for_consultant,
    )


# ---------- Endpoints ---------- #

@router.get("/taxonomy", response_model=TaxonomyResponse)
async def get_taxonomy(parent_slug: Optional[str] = None) -> TaxonomyResponse:
    """業界カテゴリツリーを取得。parent_slug 指定で子カテゴリのみ。"""
    async with async_session() as session:
        if parent_slug:
            parent_result = await session.execute(
                select(IndustryCategory).where(IndustryCategory.slug == parent_slug)
            )
            parent = parent_result.scalar_one_or_none()
            if not parent:
                raise HTTPException(404, "カテゴリが見つかりません")
            stmt = select(IndustryCategory).where(
                IndustryCategory.parent_id == parent.id
            ).order_by(IndustryCategory.sort_order)
        else:
            stmt = select(IndustryCategory).order_by(
                IndustryCategory.level, IndustryCategory.sort_order
            )

        result = await session.execute(stmt)
        cats = result.scalars().all()
        items = [_cat_out(c) for c in cats]
        return TaxonomyResponse(categories=items, total=len(items))


@router.get("/taxonomy/{slug}", response_model=CategoryOut)
async def get_category(slug: str) -> CategoryOut:
    """カテゴリ詳細を取得。"""
    async with async_session() as session:
        result = await session.execute(
            select(IndustryCategory).where(IndustryCategory.slug == slug)
        )
        c = result.scalar_one_or_none()
        if not c:
            raise HTTPException(404, "カテゴリが見つかりません")
        return _cat_out(c)


@router.get("/qualifications", response_model=QualificationListResponse)
async def list_qualifications(field: Optional[str] = None) -> QualificationListResponse:
    """資格一覧。field で絞り込み可能（建築/土木/設備/共通）。"""
    async with async_session() as session:
        stmt = select(Qualification).order_by(Qualification.field, Qualification.name)
        if field:
            stmt = stmt.where(Qualification.field == field)
        result = await session.execute(stmt)
        quals = result.scalars().all()
        items = [_qual_out(q) for q in quals]
        return QualificationListResponse(qualifications=items, total=len(items))


@router.get("/qualifications/{name}", response_model=QualificationOut)
async def get_qualification(name: str) -> QualificationOut:
    """資格詳細を取得。"""
    async with async_session() as session:
        result = await session.execute(
            select(Qualification).where(Qualification.name == name)
        )
        q = result.scalar_one_or_none()
        if not q:
            raise HTTPException(404, "資格が見つかりません")
        return _qual_out(q)


@router.post("/progress", response_model=ProgressOut)
async def record_progress(body: ProgressEntry) -> ProgressOut:
    """学習進捗を記録。"""
    async with async_session() as session:
        progress = LearningProgress(
            user_name=body.user_name,
            category_id=body.category_id,
            qualification_id=body.qualification_id,
            completed=body.completed,
            quiz_score=body.quiz_score,
        )
        session.add(progress)
        await session.commit()
        await session.refresh(progress)
        return ProgressOut(
            id=str(progress.id),
            user_name=progress.user_name,
            category_id=str(progress.category_id) if progress.category_id else None,
            qualification_id=str(progress.qualification_id) if progress.qualification_id else None,
            completed=progress.completed,
            quiz_score=progress.quiz_score,
            studied_at=progress.studied_at.isoformat() if progress.studied_at else None,
        )


@router.get("/progress/{user_name}")
async def get_progress(user_name: str) -> dict:
    """ユーザーの学習進捗一覧。"""
    async with async_session() as session:
        result = await session.execute(
            select(LearningProgress).where(
                LearningProgress.user_name == user_name
            ).order_by(LearningProgress.studied_at.desc())
        )
        entries = result.scalars().all()
        return {
            "user_name": user_name,
            "total_studied": len(entries),
            "completed": sum(1 for e in entries if e.completed),
            "entries": [
                {
                    "id": str(e.id),
                    "category_id": str(e.category_id) if e.category_id else None,
                    "qualification_id": str(e.qualification_id) if e.qualification_id else None,
                    "completed": e.completed,
                    "quiz_score": e.quiz_score,
                    "studied_at": e.studied_at.isoformat() if e.studied_at else None,
                }
                for e in entries
            ],
        }


@router.post("/seed", response_model=SeedResponse)
async def seed_data() -> SeedResponse:
    """業界知識の初期データを投入する。"""
    result = await seed_industry_knowledge()
    return SeedResponse(**result)
