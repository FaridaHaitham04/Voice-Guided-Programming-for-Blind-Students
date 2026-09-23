"""Application configuration loaded from environment variables / .env file."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ── Database ───────────────────────────────────────────────────────
    database_url: str = "mysql+pymysql://blindcode:blindcode@localhost:3307/blindcode"

    # ── JWT ────────────────────────────────────────────────────────────
    jwt_secret: str = "9Hmuaqb6yHm6HaDWHZgcC14Jxs6vhmQdWZlsHrfIwzG"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60

    # ── SovereignEG (LLM / Embeddings) ────────────────────────────────
    seg_api_key: str = "sk-8d8f735718cfa406b108f7bf9a76e77b"
    seg_base_url: str = "https://backend.sovereigneg.com/v1"
    seg_chat_model: str = "gpt-oss-20b"
    seg_embed_model: str = "bge-m3"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
