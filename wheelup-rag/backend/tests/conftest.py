"""テスト設定"""

import os

# テスト時は .env を読み込まない
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://user:password@localhost:5432/wheelup_test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")
os.environ.setdefault("QDRANT_URL", "http://localhost:6333")
os.environ.setdefault("OPENAI_API_KEY", "test-key")
os.environ.setdefault("LARK_ENCRYPT_KEY", "")
os.environ.setdefault("PIPEDRIVE_API_TOKEN", "test-token")
