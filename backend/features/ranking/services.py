from typing import List, Optional
from datetime import datetime
from fastapi import HTTPException
from database import get_database
from schemas import RecipePreview, RecipeDetail, RankingResponse

db = get_database()


class RankingService:
    """랭킹 관련 비즈니스 로직"""

    @staticmethod
    async def get_ranking_by_date(date_kst: str, limit: int = 100) -> RankingResponse:
        """
        특정 날짜의 레시피 랭킹을 가져옵니다.

        Args:
            date_kst: 날짜 (형식: YYYY-MM-DD)
            limit: 가져올 레시피 수

        Returns:
            RankingResponse: 랭킹 데이터
        """
        # 랭킹 데이터 조회
        ranking_data = await db.ranking_id.find_one(
            {"date_kst": date_kst},
            sort=[("created_at_kst", -1)],
        )

        print("RANKING_DATA:", ranking_data)

        if not ranking_data:
            raise HTTPException(
                status_code=404, detail=f"No ranking data found for {date_kst}"
            )

        # recipe_ids 가져오기
        recipe_ids = ranking_data.get("recipe_ids", [])[:limit]

        # 레시피 미리보기 정보 조회
        recipes = []
        for recipe_id in recipe_ids:
            recipe = await db.recipes.find_one({"recipe_id": recipe_id})
            if recipe:
                recipes.append(
                    RecipePreview(
                        recipe_id=recipe["recipe_id"],
                        title=recipe["title"],
                        author=recipe["author"],
                        image=recipe["image"],
                    )
                )

        return RankingResponse(
            date_kst=date_kst, recipes=recipes, total_count=len(recipes)
        )

    @staticmethod
    async def get_today_ranking(limit: int = 100) -> RankingResponse:
        """
        오늘 날짜의 레시피 랭킹을 가져옵니다.

        Args:
            limit: 가져올 레시피 수

        Returns:
            RankingResponse: 랭킹 데이터
        """
        today_kst = datetime.now().strftime("%Y-%m-%d")
        return await RankingService.get_ranking_by_date(today_kst, limit)


class RecipeService:
    """레시피 관련 비즈니스 로직"""

    @staticmethod
    async def get_recipe_detail(recipe_id: str) -> RecipeDetail:
        """
        레시피 상세 정보를 가져옵니다.

        Args:
            recipe_id: 레시피 ID

        Returns:
            RecipeDetail: 레시피 상세 정보
        """
        recipe = await db.recipes.find_one({"recipe_id": recipe_id})

        if not recipe:
            raise HTTPException(status_code=404, detail=f"Recipe {recipe_id} not found")

        return RecipeDetail(
            recipe_id=recipe["recipe_id"],
            title=recipe["title"],
            author=recipe["author"],
            image=recipe["image"],
            intro=recipe["intro"],
            portion=recipe["portion"],
            cook_time=recipe["cook_time"],
            level=recipe["level"],
            detail_url=recipe["detail_url"],
            ingredients=recipe["ingredients"],
            steps=recipe["steps"],
            registered_at=recipe["registered_at"],
            modified_at=recipe["modified_at"],
        )

    @staticmethod
    async def search_recipes(keyword: str, limit: int = 20) -> List[RecipePreview]:
        """
        레시피를 검색합니다 (제목, 재료 기준).

        Args:
            keyword: 검색 키워드
            limit: 결과 개수 제한

        Returns:
            List[RecipePreview]: 검색된 레시피 목록
        """
        # 제목 또는 재료명으로 검색
        recipes_cursor = db.recipes.find(
            {
                "$or": [
                    {"title": {"$regex": keyword, "$options": "i"}},
                    {"ingredients.name": {"$regex": keyword, "$options": "i"}},
                ]
            }
        ).limit(limit)

        recipes = []
        async for recipe in recipes_cursor:
            recipes.append(
                RecipePreview(
                    recipe_id=recipe["recipe_id"],
                    title=recipe["title"],
                    author=recipe["author"],
                    image=recipe["image"],
                )
            )

        return recipes
