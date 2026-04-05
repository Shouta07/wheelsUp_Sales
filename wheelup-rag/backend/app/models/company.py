"""紹介企業 DB モデル — Pipedrive Organization をキーワード付きで管理"""

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID

from app.core.database import Base


class Company(Base):
    """wheelsUp が候補者に紹介できる企業。"""

    __tablename__ = "companies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pipedrive_org_id = Column(Integer, unique=True, nullable=True)
    name = Column(String(300), nullable=False, index=True)
    industry = Column(String(200))
    address = Column(String(500))
    description = Column(Text)
    # 訴求キーワード（例: ["残業少ない","年収UP","発注者側","デベロッパー","福利厚生充実"]）
    keywords = Column(ARRAY(String), default=list)
    # 訴求ポイント詳細（キーワード→説明の辞書）
    pitch_points = Column(JSONB, default=dict)
    # Pipedrive メタ情報
    people_count = Column(Integer, default=0)
    open_deals_count = Column(Integer, default=0)
    won_deals_count = Column(Integer, default=0)
    # タイムスタンプ
    synced_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
