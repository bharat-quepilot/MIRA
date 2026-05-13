from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    openai_api_key: str = ""
    youtube_api_key: str = ""
    mock_mode: bool = False
    frontend_origin: str = "http://localhost:3000"


settings = Settings()
