"""建設業界ナレッジ DB モデル — SEO(Sales Enablement Office)基盤"""

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text, Boolean
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID

from app.core.database import Base


class IndustryCategory(Base):
    """業界カテゴリ（大分類→中分類→小分類の階層構造）。"""

    __tablename__ = "industry_categories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    parent_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    name = Column(String(200), nullable=False)
    slug = Column(String(100), unique=True, nullable=False)
    level = Column(Integer, nullable=False)  # 0=大分類, 1=中分類, 2=小分類
    description = Column(Text)
    # 業界知識（コンサルタントが知るべき情報）
    market_overview = Column(Text)       # 市場概要
    key_players = Column(ARRAY(String), default=list)  # 主要企業
    typical_roles = Column(ARRAY(String), default=list)  # 代表的な職種
    required_qualifications = Column(ARRAY(String), default=list)  # 関連資格
    salary_range = Column(String(200))   # 年収帯
    growth_trend = Column(String(50))    # 成長トレンド（拡大/安定/縮小）
    # 営業で使えるポイント
    selling_points = Column(JSONB, default=list)  # 候補者への訴求ポイント
    pain_points = Column(JSONB, default=list)     # この領域で働く人の典型的な不満
    talking_tips = Column(Text)          # 面談で使えるトーク例
    sort_order = Column(Integer, default=0)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class Qualification(Base):
    """資格マスタ — 建設業界の資格体系。"""

    __tablename__ = "qualifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(300), nullable=False, unique=True)
    category = Column(String(100))  # 国家資格/民間資格
    field = Column(String(100))     # 土木/建築/設備/共通
    difficulty = Column(String(50))  # 難易度（高/中/低）
    description = Column(Text)
    # 実務的な知識
    market_value = Column(Text)       # 転職市場での価値
    salary_impact = Column(String(200))  # 年収への影響
    related_roles = Column(ARRAY(String), default=list)  # 活かせる職種
    exam_info = Column(Text)          # 試験情報
    tips_for_consultant = Column(Text)  # コンサルタント向けメモ


class LearningProgress(Base):
    """学習進捗 — メンバーごとの学習状況。"""

    __tablename__ = "learning_progress"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_name = Column(String(200), nullable=False)
    category_id = Column(UUID(as_uuid=True), nullable=True)
    qualification_id = Column(UUID(as_uuid=True), nullable=True)
    completed = Column(Boolean, default=False)
    quiz_score = Column(Integer, nullable=True)  # 0-100
    studied_at = Column(DateTime(timezone=True), default=datetime.utcnow)
