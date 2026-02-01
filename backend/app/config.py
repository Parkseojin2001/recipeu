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
    "http://198.18.16.237:5173"]
    
    # CLOVA Studio
    CLOVASTUDIO_API_KEY: str
    CLOVA_INVOKE_URL: str = ""
    CLOVA_SECRET_KEY: str = ""
    CLOVA_TTS_CLIENT_ID: str = ""
    CLOVA_TTS_CLIENT_SECRET: str = ""

    # NAVER
    NAVER_CLIENT_ID: Optional[str] = None
    NAVER_CLIENT_SECRET: Optional[str] = None
    
    # Milvus
    MILVUS_HOST: str = "136.113.251.237"
    MILVUS_PORT: str = "19530"
    COLLECTION_NAME: str = "recipe_docs"
    
    # Database
    DATABASE_URL: str = "sqlite:///./recipes.db"
    
    # 사용자 프로필 (테스트용 - 기본값)
    USER_NAME: str = "나영"
    USER_ALLERGIES: List[str] = ["복숭아", "갑각류", "견과류"]
    USER_DISLIKES: List[str] = ["가지", "시금치", "고수"]
    
    # 가족 구성원 정보 (추가!)
    FAMILY_MEMBERS: Dict[str, Dict[str, Any]] = {
        "나영": {
            "role": "본인",
            "allergies": ["복숭아", "갑각류", "견과류"],
            "dislikes": ["가지", "시금치", "고수"],
            "cooking_tools": ["인덕션", "에어프라이어", "전기밥솥", "냉장고", "냄비", "프라이팬"]
        },
        "엄마": {
            "role": "어머니",
            "allergies": ["땅콩"],
            "dislikes": ["고수"],
            "cooking_tools": ["가스레인지", "냄비", "프라이팬", "오븐", "믹서기"]
        },
        "아빠": {
            "role": "아버지",
            "allergies": [],
            "dislikes": ["매운 음식"],
            "cooking_tools": ["가스레인지", "냄비", "프라이팬", "전자레인지"]
        },
        "오빠": {
            "role": "오빠",
            "allergies": ["새우"],
            "dislikes": ["버섯", "가지"],
            "cooking_tools": ["전자레인지", "에어프라이어", "전기포트"]
        }
    }
    
    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "allow"


settings = Settings()