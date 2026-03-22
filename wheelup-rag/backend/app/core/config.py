"""環境変数・設定管理"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """アプリケーション設定。環境変数 / .env から読み込み。"""

    # Lark
    lark_app_id: str = ""
    lark_app_secret: str = ""
    lark_verification_token: str = ""
    lark_encrypt_key: str = ""

    # Pipedrive
    pipedrive_api_token: str = ""
    pipedrive_webhook_secret: str = ""

    # Database
    database_url: str = "postgresql+asyncpg://user:password@localhost:5432/wheelup"
    redis_url: str = "redis://localhost:6379"

    # AI
    openai_api_key: str = ""
    embedding_model: str = "text-embedding-3-small"

    # Vector DB
    qdrant_url: str = "http://localhost:6333"
    qdrant_collection: str = "lark_chunks"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
