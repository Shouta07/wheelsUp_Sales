"""人物情報 DB モデル"""

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.core.database import Base


class Person(Base):
    __tablename__ = "persons"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False)
    company = Column(String(200))
    role = Column(String(200))
    pipedrive_person_id = Column(Integer, unique=True, nullable=True)
    lark_user_id = Column(String(100), unique=True, nullable=True)
    traits = Column(JSONB, default=dict)  # 発言傾向・懸念・意思決定パターン
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class ChannelDealMapping(Base):
    __tablename__ = "channel_deal_mapping"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    chat_id = Column(String(100), nullable=False)
    pipedrive_deal_id = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
