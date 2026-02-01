# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import settings
from core.dependencies import get_rag_system, get_recipe_db
from features.chat.router import router as chat_router
from features.recipe.router import router as recipe_router
from features.cooking.router import router as cooking_router
from features.user.router import router as user_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("\n" + "="*60)
    print("레시피 Agent API 시작")
    print("="*60)
    
    rag_system = get_rag_system()
    if rag_system:
        print("RAG 시스템 초기화 완료")
    
    recipe_db = get_recipe_db()
    if recipe_db:
        print("Recipe DB 초기화 완료")
    
    print("="*60 + "\n")
    
    yield
    
    print("\n👋 서버 종료")


app = FastAPI(
    title="레시피 챗봇 Agent API",
    description="RAG + LangGraph 기반 레시피 추천 및 조리모드",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(user_router, prefix="/api/user", tags=["User"])
app.include_router(chat_router, prefix="/api/chat", tags=["Chat"])
app.include_router(recipe_router, prefix="/api/recipe", tags=["Recipe"])
app.include_router(cooking_router, prefix="/api/cook", tags=["Cooking"])


@app.get("/")
async def root():
    return {"message": "Recipe Chatbot API"}


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "rag_available": get_rag_system() is not None,
        "db_available": get_recipe_db() is not None
    }