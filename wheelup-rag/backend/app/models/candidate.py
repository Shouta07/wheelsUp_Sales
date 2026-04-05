"""候補者カルテ DB モデル — キャリアコンサルティング面談管理"""

import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import Column, DateTime, Enum, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID

from app.core.database import Base


class CandidateStatus(str, PyEnum):
    """候補者ステータス。"""

    new = "new"                  # 新規（面談前）
    in_progress = "in_progress"  # 面談中・紹介中
    placed = "placed"            # 成約
    on_hold = "on_hold"          # 保留
    lost = "lost"                # 離脱・音信不通


class FollowUpPriority(str, PyEnum):
    """フォローアップ緊急度。"""

    high = "high"
    medium = "medium"
    low = "low"


class Candidate(Base):
    """候補者カルテ — 面談前・中・後の全情報を一元管理。"""

    __tablename__ = "candidates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pipedrive_person_id = Column(Integer, unique=True, nullable=True)
    pipedrive_deal_id = Column(Integer, nullable=True)

    # 基本情報
    name = Column(String(200), nullable=False)
    email = Column(String(300))
    phone = Column(String(50))
    age = Column(Integer)

    # 現職情報
    current_company = Column(String(300))
    current_position = Column(String(300))
    current_industry = Column(String(200))
    years_of_experience = Column(Integer)
    current_salary = Column(Integer)  # 万円

    # 資格・スキル
    qualifications = Column(ARRAY(String), default=list)  # ["1級建築施工管理技士", "宅建"]

    # 希望条件（キーワード）
    desired_keywords = Column(ARRAY(String), default=list)  # ["残業少ない", "年収UP"]
    desired_salary = Column(Integer)  # 希望年収（万円）
    desired_location = Column(String(300))
    desired_position = Column(String(300))

    # AI推定ニーズ（面談前ブリーフィングで更新）
    inferred_needs = Column(JSONB, default=dict)
    # {
    #   "likely_pain_points": ["残業多い", "キャリア停滞"],
    #   "motivation": "年収UPとワークライフバランス",
    #   "risk_factors": ["転職回数多い", "意思決定遅い"],
    #   "recommended_approach": "まず現職の不満を深掘り"
    # }

    # 面談メモ（商談中に記録）
    meeting_notes = Column(Text)

    # 紹介企業候補（マッチ結果）
    matched_companies = Column(JSONB, default=list)
    # [{"company_id": "...", "name": "...", "score": 3, "pitch": "..."}]

    # フォローアップ
    status = Column(Enum(CandidateStatus), default=CandidateStatus.new)
    follow_up_date = Column(DateTime(timezone=True))
    follow_up_priority = Column(Enum(FollowUpPriority), default=FollowUpPriority.medium)
    follow_up_notes = Column(Text)
    last_contact_date = Column(DateTime(timezone=True))
    days_since_contact = Column(Integer, default=0)

    # アクション履歴
    action_history = Column(JSONB, default=list)
    # [{"date": "2026-04-01", "action": "初回面談", "result": "希望条件ヒアリング完了"}]

    # タイムスタンプ
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
