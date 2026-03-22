"""Lark メッセージ DB モデル"""

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class Message(Base):
    __tablename__ = "messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lark_message_id = Column(String(100), unique=True, nullable=False)
    chat_id = Column(String(100), nullable=False)
    chat_name = Column(String(200))
    chat_type = Column(String(20), nullable=False)  # product/customer/internal/announce
    sender_id = Column(String(100))
    sender_name = Column(String(200))
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False)
    indexed_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    chunks = relationship("Chunk", back_populates="message", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_messages_chat", "chat_id", "created_at"),
    )
