# backend/features/user/router.py
"""
User REST API 라우터
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any

from core.dependencies import get_user_profile
from features.user.schemas import UserProfileResponse
from app.config import settings


router = APIRouter()


@router.get("/profile", response_model=UserProfileResponse)
async def get_profile(user_profile = Depends(get_user_profile)):
    """사용자 프로필 조회"""
    return user_profile


@router.get("/family")
async def get_family_info():
    """가족 구성원 정보 조회"""
    return {
        "family_members": settings.FAMILY_MEMBERS
    }


@router.get("/family/{member_name}")
async def get_member_info(member_name: str) -> Dict[str, Any]:
    """특정 가족 구성원 정보 조회"""
    
    # 전체 가족 선택
    if member_name == "전체":
        # 모든 가족의 알레르기, 싫어하는 음식 합치기
        all_allergies = set()
        all_dislikes = set()
        all_tools = set()
        
        for member_data in settings.FAMILY_MEMBERS.values():
            all_allergies.update(member_data.get("allergies", []))
            all_dislikes.update(member_data.get("dislikes", []))
            all_tools.update(member_data.get("cooking_tools", []))
        
        return {
            "name": "전체 가족",
            "role": "전체",
            "allergies": list(all_allergies),
            "dislikes": list(all_dislikes),
            "cooking_tools": list(all_tools)
        }
    
    # 특정 멤버
    member_info = settings.FAMILY_MEMBERS.get(member_name)
    
    if not member_info:
        raise HTTPException(
            status_code=404,
            detail=f"가족 구성원 '{member_name}'을(를) 찾을 수 없습니다."
        )
    
    return {
        "name": member_name,
        **member_info
    }