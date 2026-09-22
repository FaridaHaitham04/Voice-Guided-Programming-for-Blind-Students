"""Application configuration loaded from environment variables / .env file."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ── Database ───────────────────────────────────────────────────────
    database_url: str = "mysql+pymysql://echocode:echocode@localhost:3306/echocode"

    # ── JWT ────────────────────────────────────────────────────────────
    jwt_secret: str = "change-me-to-a-random-string"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60

    # ── SovereignEG (LLM / Embeddings) ────────────────────────────────
    seg_api_key: str = ""
    seg_base_url: str = "https://api.sovereigneg.ai"
    seg_chat_model: str = "seg-chat"
    seg_embed_model: str = "seg-embed"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
