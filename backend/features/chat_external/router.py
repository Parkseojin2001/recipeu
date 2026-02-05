# backend/features/chat_external/router.py
"""
외부 챗봇 WebSocket 라우터 - HyperCLOVA X-003
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict
import json
import os

router = APIRouter()

# 세션별 채팅 히스토리 저장 (메모리)
chat_sessions: Dict[str, list] = {}


@router.websocket("/ws/{session_id}")
async def external_chat_websocket(websocket: WebSocket, session_id: str):
    """
    외부 챗봇 WebSocket - HCX-003 (LangChain 사용)
    """
    await websocket.accept()
    print(f"[External WS] Connected: {session_id}")
    
    # ClovaStudio API 설정 확인
    api_key = os.getenv("CLOVASTUDIO_API_KEY")
    
    if not api_key:
        await websocket.send_json({
            "type": "error",
            "message": "ClovaStudio API가 설정되지 않았습니다."
        })
        await websocket.close()
        return
    
    # 세션 초기화
    if session_id not in chat_sessions:
        chat_sessions[session_id] = [
            {"role": "assistant", "content": "안녕하세요! 무엇이 궁금하신가요?"}
        ]
    
    try:
        # ChatClovaX import (RAG 시스템에서 사용하는 것과 동일)
        try:
            from langchain_naver import ChatClovaX
        except ImportError:
            from langchain_community.chat_models import ChatClovaX
        
        # Chat 모델 초기화
        chat_model = ChatClovaX(
            model="HCX-003",
            temperature=0.7,
            max_tokens=300,
        )
        print("[External WS] ChatClovaX 초기화 완료")
        
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message.get("type") == "user_message":
                content = message.get("content", "")
                print(f"[External WS] 사용자: {content}")
                
                chat_sessions[session_id].append({
                    "role": "user",
                    "content": content
                })
                
                await websocket.send_json({
                    "type": "thinking",
                    "message": "생각 중..."
                })
                
                try:
                    # LangChain 메시지 형식으로 변환
                    from langchain_core.messages import HumanMessage, AIMessage
                    
                    langchain_messages = []
                    for msg in chat_sessions[session_id]:
                        if msg["role"] == "user":
                            langchain_messages.append(HumanMessage(content=msg["content"]))
                        elif msg["role"] == "assistant":
                            langchain_messages.append(AIMessage(content=msg["content"]))
                    
                    # LLM 호출
                    response = chat_model.invoke(langchain_messages)
                    assistant_message = response.content
                    
                    chat_sessions[session_id].append({
                        "role": "assistant",
                        "content": assistant_message
                    })
                    
                    print(f"[External WS] 어시스턴트: {assistant_message[:50]}...")
                    
                    await websocket.send_json({
                        "type": "assistant_message",
                        "content": assistant_message
                    })
                
                except Exception as e:
                    print(f"[External WS] LLM 오류: {e}")
                    import traceback
                    traceback.print_exc()
                    await websocket.send_json({
                        "type": "error",
                        "message": "죄송합니다. 오류가 발생했습니다. 다시 시도해주세요."
                    })
    
    except WebSocketDisconnect:
        if session_id in chat_sessions:
            del chat_sessions[session_id]
            print(f"[External WS] 세션 삭제: {session_id}")
    
    except Exception as e:
        print(f"[External WS] 에러: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        print(f"[External WS] Closed: {session_id}")


@router.get("/health")
async def health_check():
    """헬스 체크"""
    api_key = os.getenv("CLOVASTUDIO_API_KEY")
    return {
        "status": "healthy",
        "clova_configured": bool(api_key),
        "active_sessions": len(chat_sessions)
    }