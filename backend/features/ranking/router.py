from fastapi import APIRouter, HTTPException, Query
from typing import List
from datetime import datetime
from schemas import RecipeDetail, RecipePreview, RankingResponse
from services import RankingService, RecipeService

router = APIRouter()


@router.get("/rankings/today", response_model=RankingResponse)
async def get_today_ranking(limit: int = Query(100, ge=1, le=100)):
    """
    오늘 날짜의 레시피 랭킹을 가져옵니다.

    Args:
        limit: 가져올 레시피 수 (기본값: 100, 최대: 100)
    """
    return await RankingService.get_today_ranking(limit)


@router.get("/rankings/{date_kst}", response_model=RankingResponse)
async def get_ranking_by_date(date_kst: str, limit: int = Query(100, ge=1, le=100)):
    """
    특정 날짜의 레시피 랭킹을 가져옵니다.

    Args:
        date_kst: 날짜 (형식: YYYY-MM-DD)
        limit: 가져올 레시피 수 (기본값: 100, 최대: 100)
    """
    # 날짜 형식 검증
    try:
        datetime.strptime(date_kst, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(
            status_code=400, detail="Invalid date format. Use YYYY-MM-DD"
        )

    return await RankingService.get_ranking_by_date(date_kst, limit)


@router.get("/recipes/search", response_model=List[RecipePreview])
async def search_recipes(
    keyword: str = Query(..., min_length=1), limit: int = Query(20, ge=1, le=100)
):
    """
    레시피를 검색합니다 (제목, 재료 기준).

    Args:
        keyword: 검색 키워드
        limit: 결과 개수 제한 (기본값: 20, 최대: 100)
    """
    return await RecipeService.search_recipes(keyword, limit)


@router.get("/recipes/{recipe_id}", response_model=RecipeDetail)
async def get_recipe_detail(recipe_id: str):
    """
    레시피 상세 정보를 가져옵니다.

    Args:
        recipe_id: 레시피 ID
    """
    return await RecipeService.get_recipe_detail(recipe_id)
