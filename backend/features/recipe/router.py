# backend/features/recipe/router.py
"""
Recipe REST API 라우터
"""
import json
from fastapi import APIRouter, Depends, HTTPException, Query

from core.dependencies import get_rag_system, get_recipe_db, get_user_profile
from core.exceptions import RAGNotAvailableError, DatabaseNotAvailableError
from features.recipe.service import RecipeService
from features.recipe.schemas import RecipeGenerateRequest

router = APIRouter()


@router.post("/generate")
async def generate_recipe(
    request: RecipeGenerateRequest,
    rag_system = Depends(get_rag_system),
    recipe_db = Depends(get_recipe_db),
    user_profile = Depends(get_user_profile)
):
    """레시피 생성 (대화 히스토리 반영)"""
    print("\n" + "="*60)
    print("[Recipe API] 레시피 생성 요청")
    print("="*60)
    
    if not rag_system:
        raise RAGNotAvailableError()
    
    if not recipe_db:
        raise DatabaseNotAvailableError()
    
    service = RecipeService(rag_system, recipe_db, user_profile)
    
    try:
        recipe_data = await service.generate_recipe(
            chat_history=request.chat_history,
            member_info=request.member_info
        )
        
        return {
            "recipe": recipe_data,
            "user_id": request.member_info.get('names', ['사용자'])[0] if request.member_info else '사용자',
            "title": recipe_data.get('title', '추천 레시피'),
            "constraints": request.member_info or {}
        }
    
    except Exception as e:
        print(f"[Recipe API] 에러 발생: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list")
async def list_recipes(
    user_id: str = Query(default=None),
    limit: int = Query(default=50),
    recipe_db=Depends(get_recipe_db),
):
    """저장된 레시피 목록 조회"""
    if not recipe_db:
        return {"recipes": []}

    rows = recipe_db.get_recent(user_id, limit)
    recipes = []
    for row in rows:
        recipes.append({
            "id": row[0],
            "title": row[1],
            "created_at": row[2],
        })
    return {"recipes": recipes}


@router.get("/{recipe_id}")
async def get_recipe(
    recipe_id: int,
    recipe_db=Depends(get_recipe_db),
):
    """레시피 상세 조회"""
    if not recipe_db:
        raise HTTPException(status_code=503, detail="DB 사용 불가")

    row = recipe_db.get_recipe_by_id(recipe_id)
    if not row:
        raise HTTPException(status_code=404, detail="레시피를 찾을 수 없습니다")

    return {
        "id": row[0],
        "user_id": row[1],
        "title": row[2],
        "recipe_json": json.loads(row[3]) if row[3] else {},
        "constraints_json": json.loads(row[4]) if row[4] else {},
        "created_at": row[5],
    }
