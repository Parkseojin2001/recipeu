# backend/features/user/schemas.py
"""
User 관련 스키마
"""
from pydantic import BaseModel
from typing import List


class UserProfileResponse(BaseModel):
    name: str
    allergies: List[str]
    dislike: List[str]


class FamilyMemberInfo(BaseModel):
    name: str
    role: str
    allergies: List[str]
    dislikes: List[str]
    cooking_tools: List[str]


class FamilyInfoResponse(BaseModel):
    family_members: dict