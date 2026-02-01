# features/cooking/router.py
"""
Cooking Agent WebSocket 라우터
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from typing import Dict
import os
import tempfile

from core.websocket import manager
from core.dependencies import get_rag_system
from core.exceptions import SessionNotFoundError
from features.cooking.agent import CookingAgent
from features.cooking.session import CookingSession


router = APIRouter()

# 세션별 Agent 저장
cooking_sessions: Dict[str, CookingAgent] = {}


@router.websocket("/ws/{session_id}")
async def cooking_websocket(
    websocket: WebSocket,
    session_id: str,
    rag_system = Depends(get_rag_system)
):
    """조리모드 Agent WebSocket"""
    
    if not rag_system:
        await websocket.close(code=1011, reason="RAG system not available")
        return
    
    await manager.connect(websocket, session_id)
    
    try:
        while True:
            data = await websocket.receive_json()
            
            if data["type"] == "init":
                # 레시피 설정
                recipe = data.get("recipe")
                
                if not recipe:
                    await manager.send_message(session_id, {
                        "type": "error",
                        "message": "레시피가 필요합니다."
                    })
                    continue
                
                # CookingAgent 생성
                try:
                    cooking_session = CookingSession(rag=rag_system)
                    agent = CookingAgent(rag_system, cooking_session)
                    agent.set_recipe(recipe)
                    
                    cooking_sessions[session_id] = agent
                    
                    # 첫 단계 안내
                    steps = recipe.get("steps", [])
                    if steps:
                        first_step = steps[0]
                        msg = f"{first_step.get('no', 1)}단계: {first_step.get('desc','')}"
                        audio_path = cooking_session.generate_tts(msg)
                        
                        await manager.send_message(session_id, {
                            "type": "cook_response",
                            "text": msg,
                            "step_index": 0,
                            "total_steps": len(steps),
                            "audio_url": f"/api/cook/audio/{os.path.basename(audio_path)}"
                        })
                
                except Exception as e:
                    await manager.send_message(session_id, {
                        "type": "error",
                        "message": f"조리 Agent 초기화 실패: {str(e)}"
                    })
            
            elif data["type"] == "text_input":
                # 텍스트 입력
                agent = cooking_sessions.get(session_id)
                if not agent:
                    await manager.send_message(session_id, {
                        "type": "error",
                        "message": "조리 세션이 없습니다."
                    })
                    continue
                
                user_text = data.get("text", "")
                
                # Agent 처리 (스트리밍)
                await manager.send_message(session_id, {
                    "type": "thinking",
                    "message": "처리 중..."
                })
                
                result = await agent.handle_input(user_text)
                
                await manager.send_message(session_id, {
                    "type": "cook_response",
                    "text": result["response"],
                    "step_index": result["current_step"],
                    "total_steps": result["total_steps"],
                    "audio_url": f"/api/cook/audio/{os.path.basename(result['audio_path'])}"
                })
    
    except WebSocketDisconnect:
        manager.disconnect(session_id)
        if session_id in cooking_sessions:
            del cooking_sessions[session_id]
    except Exception as e:
        print(f"Cooking WebSocket 오류: {e}")
        import traceback
        traceback.print_exc()
        manager.disconnect(session_id)


@router.post("/audio/{session_id}")
async def upload_audio(
    session_id: str,
    file: UploadFile = File(...)
):
    """음성 파일 업로드 및 처리"""
    agent = cooking_sessions.get(session_id)
    
    if not agent:
        raise SessionNotFoundError(session_id)
    
    # 임시 파일로 저장
    suffix = "." + file.filename.split(".")[-1].lower()
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name
    
    try:
        # Agent 처리
        result = await agent.handle_audio(tmp_path)
        
        return {
            "text": result["response"],
            "step_index": result["current_step"],
            "total_steps": result["total_steps"],
            "audio_url": f"/api/cook/audio/{os.path.basename(result['audio_path'])}"
        }
    finally:
        os.unlink(tmp_path)


@router.get("/audio/{filename}")
async def get_audio(filename: str):
    """TTS 오디오 파일 제공"""
    audio_dir = os.path.join(tempfile.gettempdir(), "cook_tts")
    file_path = os.path.join(audio_dir, filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Audio file not found")
    
    return FileResponse(file_path, media_type="audio/wav")