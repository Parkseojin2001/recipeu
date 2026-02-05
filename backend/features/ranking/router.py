import os
from motor.motor_asyncio import AsyncIOMotorClient
from fastapi import APIRouter, HTTPException, Query
from typing import List
from datetime import datetime, timedelta
from features.ranking.schemas import RecipeDetail, RecipePreview, RankingResponse

router = APIRouter()

# MongoDB 연결
MONGODB_URL = os.getenv(
    "MONGODB_URL", "mongodb://root:RootPassword123@136.113.251.237:27017"
)
DATABASE_NAME = os.getenv("DATABASE_NAME", "recipe_db")

client = AsyncIOMotorClient(MONGODB_URL)
db = client[DATABASE_NAME]

RANKING_CACHE = {
    "today": None,
    "updated_at": None,
}


async def load_today_ranking_cache():
    """오늘 랭킹을 미리 메모리에 로드 (최적화 버전)"""

    now = datetime.now()
    
    # 새벽 7시 이전이면 전날 데이터 사용
    if now.hour < 7:
        now = now - timedelta(days=1)
    
    today_kst = now.strftime("%Y-%m-%d")

    # 1️⃣ 랭킹 ID 목록 조회 (프로젝션 사용)
    ranking_data = await db.ranking_id.find_one(
        {
            "date_kst": today_kst,
            "source": "10000recipes",
        },
        {"recipe_ids": 1, "_id": 0},
        sort=[("created_at_kst", -1)],
    )

    if not ranking_data:
        print("❌ 랭킹 데이터 없음")
        return

    recipe_ids = ranking_data.get("recipe_ids", [])

    if not recipe_ids:
        print("❌ recipe_ids 비어있음")
        return

    # 2️⃣ 레시피 조회 (필요한 필드만)
    recipes_raw = await db.recipes.find(
        {"recipe_id": {"$in": recipe_ids}},
        {"recipe_id": 1, "title": 1, "author": 1, "image": 1, "_id": 0}
    ).to_list(length=200)

    if not recipes_raw:
        print("❌ recipes 컬렉션 조회 실패")
        return

    # 3️⃣ recipe_id로 매핑
    recipe_map = {r["recipe_id"]: r for r in recipes_raw}

    # 4️⃣ 🚀 순서 보존 + Pydantic 객체로 변환 (한 번만!)
    previews = [
        RecipePreview(
            recipe_id=r["recipe_id"],
            title=r.get("title", ""),
            author=r.get("author", ""),
            image=r.get("image", ""),
        )
        for rid in recipe_ids
        if (r := recipe_map.get(rid))
    ]

    # 5️⃣ 캐시 저장 (Pydantic 객체들)
    RANKING_CACHE["today"] = {
        "date_kst": today_kst,
        "recipes": previews,  # ✅ RecipePreview 객체들
        "total_count": len(previews),
    }

    RANKING_CACHE["updated_at"] = now

    print(f"✅ 랭킹 캐시 완료 ({len(previews)}개, {today_kst})")


import time

@router.get("/today", response_model=RankingResponse)
async def get_today_ranking(limit: int = Query(100, ge=1, le=100)):
    """오늘의 랭킹 조회 (캐시 사용)"""
    start = time.time()
    
    # 캐시가 있으면 바로 반환
    if RANKING_CACHE["today"]:
        data = RANKING_CACHE["today"]
        
        result = RankingResponse(
            date_kst=data["date_kst"],
            recipes=data["recipes"][:limit],  # ✅ 이미 RecipePreview 객체
            total_count=data["total_count"],
        )
        
        elapsed = time.time() - start
        print(f"⚡ 캐시 히트: {elapsed*1000:.2f}ms")
        
        return result

    # 캐시 없으면 로딩
    print("🔄 캐시 미스 - 로딩 시작")
    await load_today_ranking_cache()

    if not RANKING_CACHE["today"]:
        raise HTTPException(404, "No ranking data")

    data = RANKING_CACHE["today"]
    
    result = RankingResponse(
        date_kst=data["date_kst"],
        recipes=data["recipes"][:limit],
        total_count=data["total_count"],
    )
    
    elapsed = time.time() - start
    print(f"✅ 캐시 로드 완료: {elapsed*1000:.2f}ms")

    return result


@router.get("/{date_kst}", response_model=RankingResponse)
async def get_ranking_by_date(
    date_kst: str,
    limit: int = Query(100, ge=1, le=100),
):
    """특정 날짜 랭킹 조회"""

    try:
        datetime.strptime(date_kst, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "Invalid date format")

    ranking_data = await db.ranking_id.find_one(
        {
            "date_kst": date_kst,
            "source": "10000recipes",
        },
        sort=[("created_at_kst", -1)],
    )

    if not ranking_data:
        raise HTTPException(404, "No ranking data")

    recipe_ids = ranking_data.get("recipe_ids", [])

    recipes = await db.recipes.find(
        {"recipe_id": {"$in": recipe_ids}},
        {"recipe_id": 1, "title": 1, "author": 1, "image": 1, "_id": 0}
    ).to_list(length=200)

    # recipe_id 순서 보존
    recipe_map = {r["recipe_id"]: r for r in recipes}
    
    previews = [
        RecipePreview(
            recipe_id=r["recipe_id"],
            title=r.get("title", ""),
            author=r.get("author", ""),
            image=r.get("image", ""),
        )
        for rid in recipe_ids
        if (r := recipe_map.get(rid))
    ]

    return RankingResponse(
        date_kst=date_kst,
        recipes=previews[:limit],
        total_count=len(previews),
    )


@router.get("/search", response_model=List[RecipePreview])
async def search_recipes(
    keyword: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=100),
):
    """레시피 검색"""

    cursor = db.recipes.find(
        {
            "$or": [
                {"title": {"$regex": keyword, "$options": "i"}},
                {"ingredients.name": {"$regex": keyword, "$options": "i"}},
            ]
        },
        {"recipe_id": 1, "title": 1, "author": 1, "image": 1, "_id": 0}
    ).limit(limit)

    recipes = []

    async for r in cursor:
        recipes.append(
            RecipePreview(
                recipe_id=r["recipe_id"],
                title=r.get("title", ""),
                author=r.get("author", ""),
                image=r.get("image", ""),
            )
        )

    return recipes


@router.get("/recipes/{recipe_id}", response_model=RecipeDetail)
async def get_recipe_detail(recipe_id: str):
    """레시피 상세 조회"""

    recipe = await db.recipes.find_one({"recipe_id": recipe_id})

    if not recipe:
        raise HTTPException(404, "Recipe not found")

    return RecipeDetail(
        recipe_id=recipe["recipe_id"],
        title=recipe["title"],
        author=recipe.get("author", ""),
        image=recipe.get("image", ""),
        intro=recipe.get("intro", ""),
        portion=recipe.get("portion", ""),
        cook_time=recipe.get("cook_time", ""),
        level=recipe.get("level", ""),
        detail_url=recipe.get("detail_url", ""),
        ingredients=recipe.get("ingredients", []),
        steps=recipe.get("steps", []),
    )