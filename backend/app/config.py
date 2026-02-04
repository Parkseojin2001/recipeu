# backend/app/config.py
"""
설정 및 환경변수 관리
"""
from pydantic_settings import BaseSettings
from typing import List, Dict, Any, Optional


class Settings(BaseSettings):
    # API 설정
    APP_NAME: str = "Recipe Agent API"
    DEBUG: bool = False

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://198.18.16.237:5173",
    ]

    # CLOVA Studio
    CLOVASTUDIO_API_KEY: str = "nv-abea0d7ca1344152b10e0e2044833b97k1JI"
    CLOVA_INVOKE_URL: str = "nv-abea0d7ca1344152b10e0e2044833b97k1JI"
    CLOVA_SECRET_KEY: str = "nv-abea0d7ca1344152b10e0e2044833b97k1JI"
    CLOVA_TTS_CLIENT_ID: str = ""
    CLOVA_TTS_CLIENT_SECRET: str = ""

    # NAVER
    NAVER_CLIENT_ID: Optional[str] = None
    NAVER_CLIENT_SECRET: Optional[str] = None

    # Milvus
    MILVUS_HOST: str = "136.113.251.237"
    MILVUS_PORT: str = "19530"
    COLLECTION_NAME: str = "recipe_docs"

    # MySQL (Naver Cloud)
    MYSQL_HOST: str = "db-wl3de.pub-cdb.ntruss.com"
    MYSQL_PORT: int = 3306
    MYSQL_USER: str = "recipeu"
    MYSQL_PASSWORD: str = "recipe1234!"
    MYSQL_DATABASE: str = "recipeu"

    # MONGO DB
    MONGO_HOST: str = "136.113.251.237"
    MONGO_PORT: str = "27017"
    DB_NAME: str = "recipe_db"

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "allow"


settings = Settings()
