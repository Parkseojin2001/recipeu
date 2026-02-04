# backend/features/auth/router.py
"""
네이버 OAuth 로그인 API
"""
import secrets
import httpx
from fastapi import APIRouter, HTTPException, Query
from app.config import settings
from models.mysql_db import upsert_member

router = APIRouter()

# 네이버 OAuth 엔드포인트
NAVER_AUTH_URL = "https://nid.naver.com/oauth2.0/authorize"
NAVER_TOKEN_URL = "https://nid.naver.com/oauth2.0/token"
NAVER_PROFILE_URL = "https://openapi.naver.com/v1/nid/me"


@router.get("/login-url")
async def get_naver_login_url(callback_url: str = Query(...)):
    """
    프론트엔드가 리다이렉트할 네이버 인증 URL 반환.
    callback_url: 프론트엔드의 /naver-callback 절대 URL
    """
    if not settings.NAVER_CLIENT_ID:
        raise HTTPException(status_code=500, detail="NAVER_CLIENT_ID가 설정되지 않았습니다.")

    state = secrets.token_urlsafe(16)

    url = (
        f"{NAVER_AUTH_URL}"
        f"?response_type=code"
        f"&client_id={settings.NAVER_CLIENT_ID}"
        f"&redirect_uri={callback_url}"
        f"&state={state}"
    )
    return {"url": url, "state": state}


@router.post("/callback")
async def naver_callback(code: str = Query(...), state: str = Query(...),
                         callback_url: str = Query(...)):
    """
    프론트엔드가 네이버에서 받은 code/state를 전달하면:
    1) 액세스 토큰 발급
    2) 네이버 프로필 조회
    3) member 테이블 upsert
    4) 회원 정보 반환
    """
    # 1. 액세스 토큰 발급
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            NAVER_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "client_id": settings.NAVER_CLIENT_ID,
                "client_secret": settings.NAVER_CLIENT_SECRET,
                "code": code,
                "state": state,
                "redirect_uri": callback_url,
            },
        )

    token_data = token_resp.json()
    access_token = token_data.get("access_token")
    if not access_token:
        raise HTTPException(status_code=400, detail=f"토큰 발급 실패: {token_data}")

    # 2. 네이버 프로필 조회
    async with httpx.AsyncClient() as client:
        profile_resp = await client.get(
            NAVER_PROFILE_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )

    profile_json = profile_resp.json()
    if profile_json.get("resultcode") != "00":
        raise HTTPException(status_code=400, detail=f"프로필 조회 실패: {profile_json}")

    naver = profile_json["response"]

    # 3. DB upsert용 데이터 매핑
    member_data = {
        "naver_id": naver.get("id", ""),
        "email": naver.get("email", ""),
        "name": naver.get("name", ""),
        "nickname": naver.get("nickname", ""),
        "mem_photo": naver.get("profile_image", ""),
        "gender": naver.get("gender", "U"),
        "birthday": naver.get("birthday", ""),
        "age": naver.get("age", ""),
        "birth_year": int(naver.get("birthyear", 0) or 0),
    }

    # 4. member 테이블 upsert
    member = upsert_member(member_data)

    return {"member": member}
