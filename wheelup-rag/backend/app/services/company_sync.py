"""Pipedrive Organization → Company テーブル同期サービス"""

import logging
from datetime import datetime, timezone

from sqlalchemy import select

from app.core.database import async_session
from app.models.company import Company
from app.services.pipedrive_client import _request

logger = logging.getLogger(__name__)


async def fetch_all_organizations() -> list[dict]:
    """Pipedrive から全 Organization を取得（ページネーション対応）。"""
    orgs: list[dict] = []
    start = 0
    limit = 100
    while True:
        data = await _request(
            "GET",
            "/organizations",
            params={"start": start, "limit": limit},
        )
        items = data.get("data") or []
        orgs.extend(items)
        pagination = data.get("additional_data", {}).get("pagination", {})
        if not pagination.get("more_items_in_collection"):
            break
        start = pagination.get("next_start", start + limit)
    return orgs


async def sync_organizations() -> int:
    """Pipedrive の Organization を Company テーブルへ同期する。

    Returns:
        同期した件数
    """
    orgs = await fetch_all_organizations()
    count = 0

    async with async_session() as session:
        for org in orgs:
            org_id = org.get("id")
            if not org_id:
                continue

            existing = await session.execute(
                select(Company).where(Company.pipedrive_org_id == org_id)
            )
            company = existing.scalar_one_or_none()

            if company is None:
                company = Company(pipedrive_org_id=org_id)
                session.add(company)

            company.name = org.get("name", "")
            company.address = org.get("address", "")
            company.people_count = org.get("people_count", 0) or 0
            company.open_deals_count = org.get("open_deals_count", 0) or 0
            company.won_deals_count = org.get("won_deals_count", 0) or 0
            company.synced_at = datetime.now(timezone.utc)
            count += 1

        await session.commit()

    logger.info("Pipedrive Organization 同期完了: %d 件", count)
    return count
