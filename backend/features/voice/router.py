# features/voice/router.py
"""
음성 처리 SSE 라우터

엔드포인트:
  POST /stt           - 음성 → 텍스트 + 문장 완성도 분석 (JSON)
  POST /process-text  - 텍스트 → LLM → TTS (SSE 스트리밍)
  POST /process       - 음성 → STT → LLM → TTS (SSE, 기존 호환)
  GET  /health        - 상태 확인
"""
from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import StreamingResponse, JSONResponse
import json

from features.voice.service import (
    process_voice_pipeline,
    process_text_pipeline,
    transcribe_and_analyze,
)

router = APIRouter()


@router.post("/stt")
async def stt_with_analysis(
    audio: UploadFile = File(..., description="VAD로 감지된 음성 파일"),
):
    """
    STT + 문장 완성도 분석

    Request:
        - audio: 음성 파일 (multipart/form-data)

    Response (JSON):
        {
            "text": "인식된 텍스트",
            "completeness": "COMPLETE" | "INCOMPLETE"
        }
    """
    audio_bytes = await audio.read()

    try:
        result = await transcribe_and_analyze(audio_bytes)
        return JSONResponse(content=result)
    except Exception as e:
        return JSONResponse(
            content={"text": "", "completeness": "INCOMPLETE", "error": str(e)},
            status_code=500,
        )


@router.post("/process-text")
async def process_text(
    text: str = Form(..., description="STT 완료된 최종 텍스트"),
    current_step: str = Form("", description="현재 조리 단계 설명"),
    step_index: int = Form(0, description="현재 단계 인덱스 (0부터)"),
    total_steps: int = Form(1, description="총 단계 수"),
    history: str = Form("[]", description="대화 기록 JSON ([{role, content}, ...])"),
):
    """
    텍스트 → LLM → TTS SSE 엔드포인트
    프론트에서 STT + 문장 완성도 처리 후 최종 텍스트를 보내면 사용

    Request:
        - text: 최종 사용자 텍스트
        - current_step: 현재 조리 단계 텍스트
        - step_index: 현재 단계 인덱스
        - total_steps: 총 단계 수
        - history: 대화 기록 JSON 문자열

    Response (SSE stream):
        - {"type": "llm", "intent": "...", "text": "...", "action": "..."}
        - {"type": "tts_chunk", "audio": "<base64>", "sample_rate": 32000}
        - {"type": "done"}
        - {"type": "error", "message": "..."}
    """
    # 대화 기록 파싱
    try:
        history_list = json.loads(history) if history else []
    except (json.JSONDecodeError, TypeError):
        history_list = []

    async def event_generator():
        async for event in process_text_pipeline(
            text, current_step, step_index, total_steps, history=history_list
        ):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/process")
async def process_voice(
    audio: UploadFile = File(..., description="VAD로 감지된 음성 파일"),
    current_step: str = Form("", description="현재 조리 단계 설명"),
    step_index: int = Form(0, description="현재 단계 인덱스 (0부터)"),
    total_steps: int = Form(1, description="총 단계 수"),
):
    """
    음성 처리 SSE 엔드포인트 (기존 호환용 - 전체 파이프라인)

    Request:
        - audio: 음성 파일 (multipart/form-data)
        - current_step: 현재 조리 단계 텍스트
        - step_index: 현재 단계 인덱스
        - total_steps: 총 단계 수

    Response (SSE stream):
        - {"type": "stt", "text": "..."}
        - {"type": "llm", "intent": "...", "text": "...", "action": "..."}
        - {"type": "tts_chunk", "audio": "<base64>", "sample_rate": 32000}
        - {"type": "done"}
        - {"type": "error", "message": "..."}
    """
    audio_bytes = await audio.read()

    async def event_generator():
        async for event in process_voice_pipeline(
            audio_bytes, current_step, step_index, total_steps
        ):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/health")
async def health_check():
    """Voice API 상태 확인"""
    return {"status": "ok", "service": "voice"}
