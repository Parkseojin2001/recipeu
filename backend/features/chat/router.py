# backend/features/chat/router.py
"""
Chat Agent WebSocket 라우터 - Adaptive RAG
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
from typing import Dict, Optional
import json
import asyncio
import time

from core.websocket import manager
from core.dependencies import get_rag_system
from features.chat.agent import create_chat_agent
from models.mysql_db import (
    create_session, get_session, add_chat_message, get_session_chats,
    get_member_personalization, get_families, get_family_personalization,
    get_member_utensils, get_all_utensils, get_member_by_id
)

router = APIRouter()

# 메모리 캐시 (DB 세션 ID 매핑용)
chat_sessions: Dict[str, dict] = {}


def get_user_profile_from_db(member_id: int) -> dict:
    """MySQL에서 사용자 프로필 조회"""
    if member_id == 0:
        return {"name": "게스트", "allergies": [], "dislikes": []}

    member = get_member_by_id(member_id)
    psnl = get_member_personalization(member_id)

    return {
        "name": member.get("nickname", "사용자") if member else "사용자",
        "allergies": psnl.get("allergies", []) if psnl else [],
        "dislikes": psnl.get("dislikes", []) if psnl else []
    }


# ─────────────────────────────────────────────
# 타이밍 로그 헬퍼
# ─────────────────────────────────────────────
def _t():
    return time.time()

def _log_step(label: str, start: float, end: float):
    elapsed = (end - start) * 1000  # ms 단위
    print(f"  ⏱️  [{label}] {elapsed:.0f}ms")


@router.websocket("/ws/{session_id}")
async def chat_websocket(
    websocket: WebSocket,
    session_id: str,
    rag_system = Depends(get_rag_system)
):
    """채팅 Agent WebSocket - Adaptive RAG"""

    await websocket.accept()
    print(f"[WS] Connected: {session_id}")

    if not rag_system:
        print("[WS] RAG 시스템 없음")
        await websocket.send_json({
            "type": "error",
            "message": "RAG 시스템을 사용할 수 없습니다."
        })
        await websocket.close()
        return

    try:
        agent = create_chat_agent(rag_system)
        if not agent:
            raise ValueError("Agent 생성 실패")
        print("[WS] Adaptive RAG Agent 생성 완료")
    except Exception as e:
        print(f"[WS] Agent 생성 에러: {e}")
        import traceback
        traceback.print_exc()
        await websocket.send_json({
            "type": "error",
            "message": f"Agent 생성 실패: {str(e)}"
        })
        await websocket.close()
        return

    manager.active_connections[session_id] = websocket

    # 세션 초기화 (메모리 캐시)
    if session_id not in chat_sessions:
        chat_sessions[session_id] = {
            "messages": [],
            "user_constraints": {},
            "member_id": 0,
            "db_session_id": None
        }
    
    try:
        while True:
            # ── 타이밍: 메시지 수신 & 파싱 ──
            t_recv_start = _t()
            data = await websocket.receive_text()
            message = json.loads(data)
            _log_step("WS 수신 & JSON 파싱", t_recv_start, _t())
            
            msg_type = message.get("type")
            print(f"[WS] 메시지 수신: {msg_type}")
            
            if msg_type == "init_context":
                member_info = message.get("member_info", {})
                member_id = member_info.get("member_id", 0)
                if member_id and str(member_id).isdigit():
                    member_id = int(member_id)
                else:
                    member_id = 0

                chat_sessions[session_id]["user_constraints"] = member_info
                chat_sessions[session_id]["member_id"] = member_id

                # MySQL에 세션 생성 (로그인 사용자만)
                if member_id > 0:
                    try:
                        db_session = create_session(member_id)
                        chat_sessions[session_id]["db_session_id"] = db_session.get("session_id")
                        print(f"[WS] MySQL 세션 생성: {db_session.get('session_id')}")
                    except Exception as e:
                        print(f"[WS] MySQL 세션 생성 실패: {e}")

                # MySQL에서 사용자 프로필 조회
                user_profile = get_user_profile_from_db(member_id)
                chat_sessions[session_id]["user_profile"] = user_profile
                print(f"[WS] 컨텍스트 설정: member_id={member_id}, profile={user_profile.get('name')}")
                continue
            
            elif msg_type == "user_message":
                content = message.get("content", "")
                print(f"\n{'='*50}")
                print(f"  💬 [WS] 사용자 메시지: \"{content}\"")
                print(f"{'='*50}")

                # ── 타이밍: 전체 처리 시작점 ──
                t_total_start = _t()

                # ── 타이밍: 세션 상태 구성 ──
                t_state_start = _t()
                chat_sessions[session_id]["messages"].append({
                    "role": "user",
                    "content": content
                })

                # MySQL에 사용자 메시지 저장
                member_id = chat_sessions[session_id].get("member_id", 0)
                db_session_id = chat_sessions[session_id].get("db_session_id")
                if db_session_id and member_id > 0:
                    try:
                        add_chat_message(member_id, db_session_id, "USER", content)
                    except Exception as e:
                        print(f"[WS] 사용자 메시지 DB 저장 실패: {e}")
                
                chat_history = [
                    f"{msg['role']}: {msg['content']}"
                    for msg in chat_sessions[session_id]["messages"]
                ]
                
                agent_state = {
                    "question": content,
                    "original_question": content,
                    "chat_history": chat_history,
                    "documents": [],
                    "generation": "",
                    "web_search_needed": "no",
                    "user_constraints": chat_sessions[session_id]["user_constraints"],
                    "constraint_warning": ""
                }
                _log_step("agent_state 구성", t_state_start, _t())

                print(f"[WS] user_constraints: {chat_sessions[session_id]['user_constraints']}")
                
                await websocket.send_json({
                    "type": "thinking",
                    "message": "생각 중..."
                })
                
                async def progress_notifier():
                    steps = [
                        (0, "쿼리 재작성 중..."),
                        (3, "레시피 검색 중..."),
                        (6, "관련성 평가 중..."),
                        (10, "답변 생성 중..."),
                        (15, "거의 완료..."),
                    ]
                    
                    for delay, msg in steps:
                        await asyncio.sleep(delay if delay == 0 else 3)
                        elapsed_now = time.time() - t_total_start
                        if elapsed_now < 20:
                            await websocket.send_json({
                                "type": "progress",
                                "message": f"{msg} ({int(elapsed_now)}초)"
                            })
                        else:
                            break
                
                notifier_task = asyncio.create_task(progress_notifier())
                
                try:
                    # ── 타이밍: Agent invoke (run_in_executor) ──
                    t_agent_start = _t()
                    async def run_agent():
                        import asyncio
                        loop = asyncio.get_event_loop()
                        return await loop.run_in_executor(None, agent.invoke, agent_state)
                    
                    result = await asyncio.wait_for(run_agent(), timeout=20.0)
                    _log_step("Agent invoke (전체)", t_agent_start, _t())
                    
                    # ── 타이밍: 응답 파싱 & 전송 ──
                    t_send_start = _t()
                    response = result.get("generation", "답변을 생성할 수 없습니다.")

                    if response == "NOT_RECIPE_RELATED":
                        print(f"[WS] 요리 무관 대화 감지")
                        not_recipe_msg = "죄송합니다. 저는 요리 레시피만 도와드릴 수 있어요! 🍳\n일반적인 질문은 다른 AI 챗봇을 이용해주세요."

                        chat_sessions[session_id]["messages"].append({
                            "role": "assistant",
                            "content": not_recipe_msg
                        })

                        # MySQL에 어시스턴트 메시지 저장
                        if db_session_id and member_id > 0:
                            try:
                                add_chat_message(member_id, db_session_id, "AGENT", not_recipe_msg)
                            except Exception as e:
                                print(f"[WS] 어시스턴트 메시지 DB 저장 실패: {e}")

                        await websocket.send_json({
                            "type": "not_recipe_related",
                            "content": not_recipe_msg
                        })
                        _log_step("응답 파싱 & WS 전송", t_send_start, _t())
                        _log_step("💥 전체 처리 합계", t_total_start, _t())
                        print(f"{'='*50}\n")
                        continue

                    chat_sessions[session_id]["messages"].append({
                        "role": "assistant",
                        "content": response
                    })

                    # MySQL에 어시스턴트 메시지 저장
                    if db_session_id and member_id > 0:
                        try:
                            add_chat_message(member_id, db_session_id, "AGENT", response)
                        except Exception as e:
                            print(f"[WS] 어시스턴트 메시지 DB 저장 실패: {e}")

                    await websocket.send_json({
                        "type": "agent_message",
                        "content": response
                    })
                    _log_step("응답 파싱 & WS 전송", t_send_start, _t())

                    # ── 전체 합계 ──
                    _log_step("💥 전체 처리 합계", t_total_start, _t())
                    print(f"{'='*50}\n")
                
                except asyncio.TimeoutError:
                    elapsed = time.time() - t_total_start
                    print(f"[WS] ⏱️ Agent 타임아웃 ({elapsed:.1f}초)")
                    _log_step("💥 전체 처리 합계 (TIMEOUT)", t_total_start, _t())
                    print(f"{'='*50}\n")
                    
                    await websocket.send_json({
                        "type": "agent_message",
                        "content": f"죄송합니다. 응답 시간이 너무 오래 걸렸어요 ({int(elapsed)}초). 다시 시도해주세요."
                    })
                
                except Exception as e:
                    elapsed = time.time() - t_total_start
                    print(f"[WS] ⚠️ Agent 실행 에러 ({elapsed:.1f}초): {e}")
                    import traceback
                    traceback.print_exc()
                    _log_step("💥 전체 처리 합계 (ERROR)", t_total_start, _t())
                    print(f"{'='*50}\n")
                    
                    await websocket.send_json({
                        "type": "error",
                        "message": f"오류가 발생했습니다 ({int(elapsed)}초). 다시 시도해주세요."
                    })
                
                finally:
                    notifier_task.cancel()
                    try:
                        await notifier_task
                    except asyncio.CancelledError:
                        pass
    
    except WebSocketDisconnect:
        print(f"[WS] Disconnected: {session_id}")
    except Exception as e:
        print(f"[WS] 에러: {e}")
        import traceback
        traceback.print_exc()
    finally:
        manager.disconnect(session_id)
        print(f"[WS] Closed: {session_id}")

@router.get("/session/{session_id}")
async def get_chat_session(session_id: str):
    """채팅 세션 정보 조회"""
    print(f"[Chat API] 세션 조회: {session_id}")
    
    if session_id not in chat_sessions:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다")
    
    session = chat_sessions[session_id]
    
    return {
        "session_id": session_id,
        "messages": session.get("messages", []),
        "user_constraints": session.get("user_constraints", {})
    }