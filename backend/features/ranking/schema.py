# app/schemas.py

from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


class Ingredient(BaseModel):
    name: str
    desc: Optional[str] = None
    amount: Optional[str] = None
    category: str


class RecipePreview(BaseModel):
    recipe_id: str
    title: str
    author: str
    image: str


class RankingResponse(BaseModel):
    date_kst: str
    recipes: List[RecipePreview]
    total_count: int


class RecipeDetail(BaseModel):
    recipe_id: str
    title: str
    author: str
    image: str
    intro: str
    portion: str
    cook_time: str
    level: str
    detail_url: str
    ingredients: List[Ingredient]
    steps: List[str]
    registered_at: datetime
    modified_at: datetime

    model_config = {"json_encoders": {datetime: lambda v: v.isoformat()}}
