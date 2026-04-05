"""紹介企業一覧 & キーワードマッチング API"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select

from app.core.database import async_session
from app.models.company import Company
from app.services.company_sync import sync_organizations

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/companies")


# ---------- Schemas ---------- #

class CompanyOut(BaseModel):
    """企業レスポンス。"""

    id: str
    pipedrive_org_id: Optional[int] = None
    name: str
    industry: Optional[str] = None
    address: Optional[str] = None
    description: Optional[str] = None
    keywords: list[str] = []
    pitch_points: dict = {}
    people_count: int = 0
    open_deals_count: int = 0
    won_deals_count: int = 0


class CompanyListResponse(BaseModel):
    """企業一覧レスポンス。"""

    companies: list[CompanyOut]
    total: int


class KeywordMatchRequest(BaseModel):
    """キーワードマッチリクエスト。"""

    keywords: list[str]


class MatchedCompany(BaseModel):
    """マッチ結果の企業。"""

    company: CompanyOut
    matched_keywords: list[str]
    match_score: int  # マッチしたキーワード数
    pitch_summary: list[str]  # マッチしたキーワードの訴求ポイント


class KeywordMatchResponse(BaseModel):
    """キーワードマッチレスポンス。"""

    results: list[MatchedCompany]
    total: int
    query_keywords: list[str]


class KeywordUpdateRequest(BaseModel):
    """企業キーワード更新リクエスト。"""

    keywords: list[str]
    pitch_points: dict = {}


class SyncResponse(BaseModel):
    """同期レスポンス。"""

    synced: int
    message: str


# ---------- Endpoints ---------- #

@router.get("", response_model=CompanyListResponse)
async def list_companies(
    q: Optional[str] = None,
    keyword: Optional[str] = None,
) -> CompanyListResponse:
    """企業一覧を取得する。名前やキーワードでフィルタ可能。"""
    async with async_session() as session:
        stmt = select(Company).order_by(Company.name)

        if q:
            stmt = stmt.where(Company.name.ilike(f"%{q}%"))

        if keyword:
            # PostgreSQL ARRAY の any 演算子でキーワード部分一致
            stmt = stmt.where(
                func.array_to_string(Company.keywords, ",").ilike(f"%{keyword}%")
            )

        result = await session.execute(stmt)
        companies = result.scalars().all()

        items = [
            CompanyOut(
                id=str(c.id),
                pipedrive_org_id=c.pipedrive_org_id,
                name=c.name,
                industry=c.industry,
                address=c.address,
                description=c.description,
                keywords=c.keywords or [],
                pitch_points=c.pitch_points or {},
                people_count=c.people_count,
                open_deals_count=c.open_deals_count,
                won_deals_count=c.won_deals_count,
            )
            for c in companies
        ]
        return CompanyListResponse(companies=items, total=len(items))


@router.post("/match", response_model=KeywordMatchResponse)
async def match_companies(body: KeywordMatchRequest) -> KeywordMatchResponse:
    """候補者のキーワードに基づいて企業をマッチングする。

    候補者の希望条件（キーワード）を入力すると、
    マッチする企業を訴求ポイント付きで返す。
    """
    if not body.keywords:
        raise HTTPException(status_code=400, detail="キーワードを1つ以上指定してください")

    query_kws = [kw.strip().lower() for kw in body.keywords if kw.strip()]

    async with async_session() as session:
        result = await session.execute(select(Company).order_by(Company.name))
        companies = result.scalars().all()

    matched: list[MatchedCompany] = []

    for c in companies:
        company_kws = [k.lower() for k in (c.keywords or [])]
        hits = [kw for kw in query_kws if any(kw in ck for ck in company_kws)]

        if not hits:
            continue

        pitch_summary = []
        for kw in hits:
            for orig_kw, point in (c.pitch_points or {}).items():
                if kw in orig_kw.lower():
                    pitch_summary.append(f"【{orig_kw}】{point}")
                    break
            else:
                pitch_summary.append(f"【{kw}】該当あり")

        matched.append(
            MatchedCompany(
                company=CompanyOut(
                    id=str(c.id),
                    pipedrive_org_id=c.pipedrive_org_id,
                    name=c.name,
                    industry=c.industry,
                    address=c.address,
                    description=c.description,
                    keywords=c.keywords or [],
                    pitch_points=c.pitch_points or {},
                    people_count=c.people_count,
                    open_deals_count=c.open_deals_count,
                    won_deals_count=c.won_deals_count,
                ),
                matched_keywords=hits,
                match_score=len(hits),
                pitch_summary=pitch_summary,
            )
        )

    matched.sort(key=lambda m: m.match_score, reverse=True)

    return KeywordMatchResponse(
        results=matched,
        total=len(matched),
        query_keywords=query_kws,
    )


@router.put("/{company_id}/keywords", response_model=CompanyOut)
async def update_keywords(company_id: str, body: KeywordUpdateRequest) -> CompanyOut:
    """企業のキーワードと訴求ポイントを更新する。"""
    async with async_session() as session:
        result = await session.execute(
            select(Company).where(Company.id == company_id)
        )
        company = result.scalar_one_or_none()
        if not company:
            raise HTTPException(status_code=404, detail="企業が見つかりません")

        company.keywords = body.keywords
        if body.pitch_points:
            existing = company.pitch_points or {}
            existing.update(body.pitch_points)
            company.pitch_points = existing

        await session.commit()
        await session.refresh(company)

        return CompanyOut(
            id=str(company.id),
            pipedrive_org_id=company.pipedrive_org_id,
            name=company.name,
            industry=company.industry,
            address=company.address,
            description=company.description,
            keywords=company.keywords or [],
            pitch_points=company.pitch_points or {},
            people_count=company.people_count,
            open_deals_count=company.open_deals_count,
            won_deals_count=company.won_deals_count,
        )


@router.post("/sync", response_model=SyncResponse)
async def sync_from_pipedrive() -> SyncResponse:
    """Pipedrive の Organization データを同期する。"""
    count = await sync_organizations()
    return SyncResponse(synced=count, message=f"{count} 件の企業を同期しました")
