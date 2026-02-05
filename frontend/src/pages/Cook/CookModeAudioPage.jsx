"use client";

import { useNavigate, useLocation } from "react-router-dom";
import React, { useEffect, useMemo, useRef, useState } from "react";
import RecipeLayout from "@/layouts/RecipeLayout";
import "./CookModeAudioPage.css";

/**
 * CookModeAudioPage
 * - VAD로 음성 감지 → 백엔드 STT (Clova Speech) + Kiwi 완성도 분석
 * - COMPLETE → 즉시 LLM+TTS 파이프라인
 * - INCOMPLETE → 추가 대기 후 강제 전송
 * - LLM/TTS는 백엔드 SSE 스트리밍
 * - [New] Thinking Dots UI (User/AI) & Pipeline Busy Check
 */

// 백엔드 API URL
const API_URL = import.meta.env.VITE_API_URL || "";

// ====== VAD tuning ======
const VAD_START_THRESHOLD = 0.08; // 음성 시작 감지 RMS 기준
const VAD_END_THRESHOLD = 0.025; // 음성 종료 감지 RMS 기준
const VAD_SILENCE_MS = 1500; // 침묵 대기 시간
const VAD_MIN_SPEECH_MS = 300; // 최소 발화 길이
const INCOMPLETE_EXTRA_WAIT_MS = 2000; // INCOMPLETE일 때 추가 대기

function pickMimeType() {
  const candidates = [
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

function nowTs() {
  return Date.now();
}

// ====== TTS 오디오 재생 클래스 ======
class TTSStreamPlayer {
  constructor() {
    this.audioContext = null;
    this.isPlaying = false;
    this.leftoverChunk = null;
    this.nextStartTime = 0;
    this.sampleRate = 32000;
    this.activeSources = []; // 예약된 BufferSource 추적
  }

  async init() {
    // 이전 context가 남아있으면 정리
    this.stop();
    this.audioContext = new (
      window.AudioContext || window.webkitAudioContext
    )();
    this.isPlaying = true;
    this.leftoverChunk = null;
    this.activeSources = [];
    this.nextStartTime = this.audioContext.currentTime;
  }

  setSampleRate(rate) {
    this.sampleRate = rate;
  }

  playChunk(base64Audio) {
    if (!this.audioContext || !this.isPlaying) return;

    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    let chunkToProcess = bytes;

    if (this.leftoverChunk) {
      const combined = new Uint8Array(this.leftoverChunk.length + bytes.length);
      combined.set(this.leftoverChunk);
      combined.set(bytes, this.leftoverChunk.length);
      chunkToProcess = combined;
      this.leftoverChunk = null;
    }

    const remainder = chunkToProcess.length % 2;
    if (remainder !== 0) {
      this.leftoverChunk = chunkToProcess.slice(
        chunkToProcess.length - remainder,
      );
      chunkToProcess = chunkToProcess.slice(
        0,
        chunkToProcess.length - remainder,
      );
    }

    if (chunkToProcess.byteLength === 0) return;

    const int16Data = new Int16Array(
      chunkToProcess.buffer,
      chunkToProcess.byteOffset,
      chunkToProcess.byteLength / 2,
    );
    const float32Data = new Float32Array(int16Data.length);
    for (let i = 0; i < int16Data.length; i++) {
      float32Data[i] = int16Data[i] / 32768.0;
    }

    const audioBuffer = this.audioContext.createBuffer(
      1,
      float32Data.length,
      this.sampleRate,
    );
    audioBuffer.getChannelData(0).set(float32Data);

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    if (this.nextStartTime < this.audioContext.currentTime) {
      this.nextStartTime = this.audioContext.currentTime + 0.02;
    }

    source.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;

    // 재생 완료 시 목록에서 제거
    this.activeSources.push(source);
    source.onended = () => {
      this.activeSources = this.activeSources.filter((s) => s !== source);
    };
  }

  stop() {
    this.isPlaying = false;
    this.leftoverChunk = null;
    if (this.audioContext) {
      // 1) suspend로 오디오 출력 즉시 정지
      try {
        this.audioContext.suspend();
      } catch {}
      // 2) 예약된 모든 오디오 소스 중단
      for (const src of this.activeSources) {
        try {
          src.disconnect();
        } catch {}
        try {
          src.stop();
        } catch {}
      }
      // 3) context 닫기
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.activeSources = [];
  }
}

const ttsStreamPlayer = new TTSStreamPlayer();

export default function CookModeAudioPage() {
  const navigate = useNavigate();
  const location = useLocation();

  // CookModePage에서 전달받은 데이터
  const passedStepIndex = location.state?.currentStepIndex ?? 0;
  const passedRecipeSteps = location.state?.recipeSteps || [];
  const passedRecipe = location.state?.recipe || { name: "레시피 없음" };
  const passedElapsedTime = location.state?.elapsedTime ?? 0;

  const [currentStepIndex, setCurrentStepIndex] = useState(passedStepIndex);
  const [elapsedTime, setElapsedTime] = useState(passedElapsedTime);

  // 슬라이드 애니메이션 상태
  const [slideDir, setSlideDir] = useState("");
  const isAnimatingRef = useRef(false);

  const recipeSteps =
    passedRecipeSteps.length > 0
      ? passedRecipeSteps
      : [{ no: 1, desc: "레시피 정보가 없습니다." }];

  // 타이머
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  // Chat messages
  const [messages, setMessages] = useState([
    { id: "welcome", type: "ai", text: "퓨에게 물어보세요~!", status: "done" },
  ]);
  const [errorMsg, setErrorMsg] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [vadState, setVadState] = useState("idle");
  const [pipelineBusy, setPipelineBusy] = useState(false);

  // Pipeline Busy Ref
  const pipelineBusyRef = useRef(false);
  // 파이프라인 세부 단계: "idle" | "llm_waiting" | "tts_streaming"
  const pipelinePhaseRef = useRef("idle");

  // Thinking Message Refs
  const userThinkingMsgIdRef = useRef(null);
  const aiThinkingMsgIdRef = useRef(null);
  const pendingUserMsgIdRef = useRef(null);

  // 채팅 자동 스크롤 ref
  const chatMessagesRef = useRef(null);

  const supported = useMemo(() => {
    return !!(
      navigator?.mediaDevices?.getUserMedia &&
      typeof window !== "undefined" &&
      typeof window.MediaRecorder !== "undefined"
    );
  }, []);

  // Audio refs
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);

  // VAD refs
  const vadStateRef = useRef("idle");
  const speechStartAtRef = useRef(null);
  const lastAboveAtRef = useRef(null);
  const segStartAtRef = useRef(null);

  // Recorder refs
  const segRecorderRef = useRef(null);
  const segChunksRef = useRef([]);
  const mimeTypeRef = useRef("");

  // SSE fetch 중단용
  const abortControllerRef = useRef(null);

  // 텍스트 버퍼
  const textBufferRef = useRef([]);
  const incompleteTimerRef = useRef(null);

  // 채팅 메시지 변경 시 자동 스크롤
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [messages]);

  // currentStepIndex를 ref로도 관리
  const currentStepIndexRef = useRef(currentStepIndex);
  useEffect(() => {
    currentStepIndexRef.current = currentStepIndex;
  }, [currentStepIndex]);

  // 마이크 스트림 및 상태 정리 함수
  const cleanupAllAudio = () => {
    console.log("[cleanup] 오디오 리소스 정리 시작");

    if (incompleteTimerRef.current) {
      clearTimeout(incompleteTimerRef.current);
      incompleteTimerRef.current = null;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const recorder = segRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch (e) {
        console.log("[cleanup] recorder stop error:", e);
      }
      segRecorderRef.current = null;
    }

    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    const audioCtx = audioCtxRef.current;
    if (audioCtx && audioCtx.state !== "closed") {
      audioCtx.close().catch(() => {});
      audioCtxRef.current = null;
    }

    analyserRef.current = null;
    textBufferRef.current = [];

    // Thinking Refs 초기화
    pendingUserMsgIdRef.current = null;
    userThinkingMsgIdRef.current = null;
    aiThinkingMsgIdRef.current = null;
    pipelinePhaseRef.current = "idle";

    ttsStreamPlayer.stop();

    console.log("[cleanup] 오디오 리소스 정리 완료");
  };

  // 페이지 진입 시 자동으로 녹음 시작
  useEffect(() => {
    startListening();

    return () => {
      cleanupAllAudio();
      setMessages((prev) => {
        prev.forEach((m) => {
          if (m.audioUrl) URL.revokeObjectURL(m.audioUrl);
        });
        return prev;
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function animateStepChange(direction) {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    setSlideDir(direction === "next" ? "slide-left" : "slide-right");

    setTimeout(() => {
      setCurrentStepIndex((i) =>
        direction === "next"
          ? Math.min(i + 1, recipeSteps.length - 1)
          : Math.max(i - 1, 0),
      );
      setSlideDir(
        direction === "next" ? "enter-from-right" : "enter-from-left",
      );

      setTimeout(() => {
        setSlideDir("");
        isAnimatingRef.current = false;
      }, 300);
    }, 250);
  }

  function applyIntentAction(intent, action) {
    if (intent === "next_step") {
      if (action === "end_cooking") return;
      animateStepChange("next");
    } else if (intent === "prev_step") {
      if (action === "blocked") return;
      animateStepChange("prev");
    } else if (intent === "finish") {
      return;
    }
  }

  function appendMessage(msg) {
    const id =
      msg.id || `msg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    setMessages((prev) => [...prev, { id, ...msg }]);
    return id;
  }

  function patchMessage(id, patch) {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    );
  }

  // ====== 텍스트 버퍼 → LLM+TTS 전송 ======
  function flushTextBuffer() {
    if (incompleteTimerRef.current) {
      clearTimeout(incompleteTimerRef.current);
      incompleteTimerRef.current = null;
    }

    const buffer = textBufferRef.current;
    if (buffer.length === 0) return;

    const finalText = buffer.join(" ");
    textBufferRef.current = [];

    console.log(`[flushTextBuffer] 최종 텍스트: "${finalText}"`);

    // 임시 메시지(Pending)가 있다면 확정 짓고, 없다면 새로 추가
    if (pendingUserMsgIdRef.current) {
      patchMessage(pendingUserMsgIdRef.current, {
        text: finalText,
        status: "done",
      });
      pendingUserMsgIdRef.current = null;
    } else {
      appendMessage({ type: "user", text: finalText });
    }

    // LLM+TTS 파이프라인 호출
    processTextWithBackend(finalText);
  }

  // ====== 백엔드 STT 호출 ======
  async function processSTT(audioBlob) {
    console.log("[processSTT] 호출됨, blob 크기:", audioBlob.size);

    const formData = new FormData();
    formData.append("audio", audioBlob, "audio.webm");

    try {
      const response = await fetch(`${API_URL}/api/voice/stt`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      const { text, completeness } = result;

      // 텍스트 없음 -> User Thinking 제거 후 종료
      if (!text) {
        console.log("[processSTT] 텍스트 없음");
        if (userThinkingMsgIdRef.current && !pendingUserMsgIdRef.current) {
          setMessages((prev) =>
            prev.filter((m) => m.id !== userThinkingMsgIdRef.current),
          );
          userThinkingMsgIdRef.current = null;
        }
        return;
      }

      // 텍스트 버퍼 추가
      textBufferRef.current.push(text);
      const bufferText = textBufferRef.current.join(" ");
      console.log(`[processSTT] 인식: "${text}" → [${completeness}]`);

      // "인식 중..."(Thinking)을 실제 텍스트로 교체 (Thinking -> Pending)
      if (userThinkingMsgIdRef.current && !pendingUserMsgIdRef.current) {
        pendingUserMsgIdRef.current = userThinkingMsgIdRef.current;
        userThinkingMsgIdRef.current = null;
        patchMessage(pendingUserMsgIdRef.current, {
          text: bufferText,
          status: "pending",
        });
      } else if (pendingUserMsgIdRef.current) {
        patchMessage(pendingUserMsgIdRef.current, { text: bufferText });
      } else {
        pendingUserMsgIdRef.current = appendMessage({
          type: "user",
          text: bufferText,
          status: "pending",
        });
      }

      if (completeness === "COMPLETE") {
        console.log("[processSTT] COMPLETE → 즉시 전송");
        flushTextBuffer();
      } else {
        console.log(
          `[processSTT] INCOMPLETE → ${INCOMPLETE_EXTRA_WAIT_MS}ms 추가 대기`,
        );
        if (incompleteTimerRef.current) {
          clearTimeout(incompleteTimerRef.current);
        }
        incompleteTimerRef.current = setTimeout(() => {
          incompleteTimerRef.current = null;
          if (textBufferRef.current.length > 0) {
            console.log("[processSTT] 타임아웃! 강제 전송");
            flushTextBuffer();
          }
        }, INCOMPLETE_EXTRA_WAIT_MS);
      }
    } catch (e) {
      console.error("[processSTT] 오류:", e);
      if (userThinkingMsgIdRef.current) {
        setMessages((prev) =>
          prev.filter((m) => m.id !== userThinkingMsgIdRef.current),
        );
        userThinkingMsgIdRef.current = null;
      }
      appendMessage({
        type: "ai",
        text: "⚠️ 잠시 문제가 생겼어요. 나중에 시도해주세요!",
        status: "error",
      });
    }
  }

  // ====== 백엔드 LLM+TTS SSE 호출 ======
  async function processTextWithBackend(userText) {
    console.log("[processTextWithBackend] 호출됨, 텍스트:", userText);

    setPipelineBusy(true);
    pipelineBusyRef.current = true;
    pipelinePhaseRef.current = "llm_waiting";

    // [UI] AI "생각 중..." 표시
    const thinkingId = appendMessage({
      type: "ai",
      text: "생각 중...",
      status: "thinking",
    });
    aiThinkingMsgIdRef.current = thinkingId;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const currentStepText =
      recipeSteps[currentStepIndexRef.current]?.desc ?? "";

    // 멀티턴: 과거 대화 기록 추출 (최근 6개, welcome 제외)
    const history = messages
      .filter((m) => m.status === "done" || m.status === "tts_streaming")
      .filter((m) => m.type === "user" || m.type === "ai")
      .filter((m) => m.id !== "welcome")
      .slice(-6)
      .map((m) => ({
        role: m.type === "user" ? "user" : "assistant",
        content: m.text,
      }));

    const formData = new FormData();
    formData.append("text", userText);
    formData.append("current_step", currentStepText);
    formData.append("step_index", String(currentStepIndexRef.current));
    formData.append("total_steps", String(recipeSteps.length));
    formData.append("history", JSON.stringify(history));

    let aiMsgId = null; // 실제 메시지로 변환될 ID
    let lastAction = null;
    let lastDelaySeconds = 0;

    try {
      const response = await fetch(`${API_URL}/api/voice/process-text`, {
        method: "POST",
        body: formData,
        signal: abortController.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      await ttsStreamPlayer.init();

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;

          try {
            const jsonStr = line.slice(6);
            const event = JSON.parse(jsonStr);

            switch (event.type) {
              case "llm":
                // LLM 응답 도착 → TTS 스트리밍 단계로 전환 (VAD 허용)
                pipelinePhaseRef.current = "tts_streaming";
                pipelineBusyRef.current = false;

                lastAction = event.action || null;
                lastDelaySeconds = event.delay_seconds || 0;

                // [UI 중요] 텍스트가 있으면 "생각 중..."을 답변으로 교체
                if (event.text) {
                  if (aiThinkingMsgIdRef.current) {
                    // Thinking 메시지를 Reuse
                    aiMsgId = aiThinkingMsgIdRef.current;
                    patchMessage(aiMsgId, {
                      text: event.text,
                      intent: event.intent,
                      status: "tts_streaming", // Thinking 해제
                    });
                    aiThinkingMsgIdRef.current = null;
                  } else {
                    // 혹시 Thinking이 없었다면 새로 생성
                    aiMsgId = appendMessage({
                      type: "ai",
                      text: event.text,
                      intent: event.intent,
                      status: "tts_streaming",
                    });
                  }
                } else {
                  // 텍스트가 없는 경우(단순 액션 등) Thinking 제거
                  if (aiThinkingMsgIdRef.current) {
                    setMessages((prev) =>
                      prev.filter((m) => m.id !== aiThinkingMsgIdRef.current),
                    );
                    aiThinkingMsgIdRef.current = null;
                  }
                }

                applyIntentAction(event.intent, event.action);
                break;

              case "tts_chunk":
                if (event.sample_rate) {
                  ttsStreamPlayer.setSampleRate(event.sample_rate);
                }
                ttsStreamPlayer.playChunk(event.audio);
                break;

              case "done":
                pipelinePhaseRef.current = "idle";
                if (aiMsgId) {
                  patchMessage(aiMsgId, { status: "done" });
                }
                if (lastAction === "end_cooking") {
                  const delay = (lastDelaySeconds || 10) * 1000;
                  setTimeout(() => {
                    cleanupAllAudio();
                    navigate("/cook", {
                      state: {
                        recipe: passedRecipe,
                        currentStepIndex: currentStepIndexRef.current,
                        elapsedTime,
                        cookingFinished: true,
                      },
                    });
                  }, delay);
                } else if (lastAction === "finish") {
                  const delay = (lastDelaySeconds || 10) * 1000;
                  setTimeout(() => {
                    setIsListening(false);
                    setVadStateInternal("idle");
                    cleanupAllAudio();
                    navigate("/cook", {
                      state: {
                        recipe: passedRecipe,
                        currentStepIndex: currentStepIndexRef.current,
                        elapsedTime,
                      },
                    });
                  }, delay);
                }
                break;

              case "error":
                console.error("[SSE] 서버 에러:", event.message);
                if (aiThinkingMsgIdRef.current) {
                  setMessages((prev) =>
                    prev.filter((m) => m.id !== aiThinkingMsgIdRef.current),
                  );
                  aiThinkingMsgIdRef.current = null;
                }
                appendMessage({
                  type: "ai",
                  text: "⚠️ 잠시 문제가 생겼어요. 나중에 시도해주세요!",
                  status: "error",
                });
                break;
            }
          } catch (parseErr) {
            console.error("[SSE] 파싱 오류:", parseErr, line);
          }
        }
      }
    } catch (e) {
      if (e.name === "AbortError") {
        console.log("[processTextWithBackend] 요청 중단됨 (abort)");
        return;
      }
      console.error("[processTextWithBackend] 오류:", e);
      if (aiThinkingMsgIdRef.current) {
        setMessages((prev) =>
          prev.filter((m) => m.id !== aiThinkingMsgIdRef.current),
        );
        aiThinkingMsgIdRef.current = null;
      }
      appendMessage({
        type: "ai",
        text: "⚠️ 잠시 문제가 생겼어요. 나중에 시도해주세요!",
        status: "error",
      });
    } finally {
      setPipelineBusy(false);
      pipelineBusyRef.current = false;
      pipelinePhaseRef.current = "idle";
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
    }
  }

  // ====== VAD 및 녹음 로직 ======
  function startSegmentRecording() {
    const stream = streamRef.current;
    if (!stream) return;

    segChunksRef.current = [];
    const mt = mimeTypeRef.current;
    const recorder = new MediaRecorder(
      stream,
      mt && mt !== "browser-default" ? { mimeType: mt } : undefined,
    );
    segRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) segChunksRef.current.push(e.data);
    };

    recorder.onerror = (e) => {
      console.error("[recorder] 녹음 오류:", e?.error?.message || "unknown");
    };

    recorder.onstop = async () => {
      const chunks = segChunksRef.current;
      segChunksRef.current = [];
      segRecorderRef.current = null;

      if (!chunks.length) {
        segStartAtRef.current = null;
        return;
      }

      const audioBlob = new Blob(chunks, {
        type: recorder.mimeType || "audio/webm",
      });
      const endAt = nowTs();
      const startAt = segStartAtRef.current || endAt;
      const durationMs = Math.max(0, endAt - startAt);

      if (durationMs < VAD_MIN_SPEECH_MS) {
        segStartAtRef.current = null;
        if (userThinkingMsgIdRef.current) {
          setMessages((prev) =>
            prev.filter((m) => m.id !== userThinkingMsgIdRef.current),
          );
          userThinkingMsgIdRef.current = null;
        }
        return;
      }

      segStartAtRef.current = null;
      console.log("[recorder.onstop] 오디오 생성 완료 → STT 호출");
      processSTT(audioBlob);
    };

    recorder.start(250);
  }

  function stopSegmentRecording() {
    try {
      const r = segRecorderRef.current;
      if (r && r.state !== "inactive") {
        try {
          r.requestData?.();
        } catch {}
        r.stop();
      }
    } catch {}
  }

  function setVadStateInternal(next) {
    vadStateRef.current = next;
    setVadState(next);
  }

  function loopVAD() {
    const analyser = analyserRef.current;
    if (!analyser) return;

    // LLM 대기 중에는 VAD 완전 차단 (intercept 방지)
    if (pipelinePhaseRef.current === "llm_waiting") {
      rafRef.current = requestAnimationFrame(loopVAD);
      return;
    }

    const bufferLen = analyser.fftSize;
    const data = new Uint8Array(bufferLen);
    analyser.getByteTimeDomainData(data);

    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    const now = nowTs();

    if (vadStateRef.current === "idle") {
      if (rms >= VAD_START_THRESHOLD) {
        console.log("[VAD] Speaking 전환");

        // [수정 핵심] 백엔드 상태(TTS_STREAMING) 뿐만 아니라,
        // 실제로 오디오가 재생 중인지(activeSources)도 확인하여 중단 처리
        if (
          pipelinePhaseRef.current === "tts_streaming" ||
          ttsStreamPlayer.activeSources.length > 0
        ) {
          console.log("[VAD] 재생 중 음성 감지 → 강제 중단 및 SSE 취소");
          ttsStreamPlayer.stop(); // 1. 브라우저 오디오 재생 중지

          if (abortControllerRef.current) {
            abortControllerRef.current.abort(); // 2. 백엔드 생성 중지
            abortControllerRef.current = null;
          }

          // 상태 초기화
          pipelinePhaseRef.current = "idle";
          setPipelineBusy(false);
          pipelineBusyRef.current = false;
        }

        if (incompleteTimerRef.current) {
          clearTimeout(incompleteTimerRef.current);
          incompleteTimerRef.current = null;
        }

        lastAboveAtRef.current = now;
        speechStartAtRef.current = now;
        segStartAtRef.current = now;
        setVadStateInternal("speaking");

        if (!userThinkingMsgIdRef.current) {
          userThinkingMsgIdRef.current = appendMessage({
            type: "user",
            text: "인식 중...",
            status: "thinking",
          });
        }

        startSegmentRecording();
      }
    } else if (vadStateRef.current === "speaking") {
      if (rms >= VAD_END_THRESHOLD) {
        lastAboveAtRef.current = now;
      } else {
        const silentFor = now - (lastAboveAtRef.current || now);
        if (silentFor >= VAD_SILENCE_MS) {
          console.log("[VAD] Idle 전환");
          setVadStateInternal("idle");
          stopSegmentRecording();
        }
      }
    }

    rafRef.current = requestAnimationFrame(loopVAD);
  }

  async function startListening() {
    if (!supported) {
      setErrorMsg("이 브라우저는 마이크를 지원하지 않아요.");
      return;
    }

    if (streamRef.current) {
      cleanupAllAudio();
    }
    setErrorMsg("");

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtxRef.current = audioCtx;

    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyserRef.current = analyser;

    source.connect(analyser);

    mimeTypeRef.current = pickMimeType() || "browser-default";
    lastAboveAtRef.current = null;
    speechStartAtRef.current = null;
    segStartAtRef.current = null;
    textBufferRef.current = [];
    setVadStateInternal("idle");

    setIsListening(true);
    rafRef.current = requestAnimationFrame(loopVAD);
  }

  function handleMicClick() {
    setIsListening(false);
    setVadStateInternal("idle");
    cleanupAllAudio();
    navigate("/cook", {
      state: {
        recipe: passedRecipe,
        currentStepIndex,
        elapsedTime,
      },
    });
  }

  const formattedSteps = recipeSteps.map((step, index) => ({
    no: step.no || index + 1,
    desc: step.desc || "",
  }));

  return (
    <RecipeLayout
      steps={formattedSteps}
      currentStep={currentStepIndex + 1}
      onStepClick={(index) => {
        if (index === currentStepIndex || isAnimatingRef.current) return;
        const dir = index > currentStepIndex ? "next" : "prev";
        isAnimatingRef.current = true;
        setSlideDir(dir === "next" ? "slide-left" : "slide-right");
        setTimeout(() => {
          setCurrentStepIndex(index);
          setSlideDir(dir === "next" ? "enter-from-right" : "enter-from-left");
          setTimeout(() => {
            setSlideDir("");
            isAnimatingRef.current = false;
          }, 300);
        }, 250);
      }}
    >
      <h1 className="cook-recipe-title">{passedRecipe.name}</h1>

      <div className="cook-time-record-row">
        <div className="cook-time-section">
          <span className="cook-time-text">
            소요시간 {formatTime(elapsedTime)}
          </span>
          <img
            src="/stopwatch.png"
            alt="스톱워치"
            className="cook-stopwatch-icon"
            onError={(e) => (e.target.style.display = "none")}
          />
        </div>

        <div className="cook-record-section">
          <button
            className={`cook-record-btn ${isListening ? "recording" : ""}`}
            onClick={handleMicClick}
            disabled={!supported}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          </button>
        </div>
      </div>

      {/* 단계 설명 (슬라이드 애니메이션 적용) */}
      <div className={`cook-step-box ${slideDir}`}>
        <span className="cook-step-label">
          STEP {recipeSteps[currentStepIndex]?.no || currentStepIndex + 1}
        </span>
        <p className="cook-step-description">
          {recipeSteps[currentStepIndex]?.desc || "단계 정보가 없습니다."}
        </p>
      </div>

      {/* 채팅 박스 */}
      <div className="audio-chat-box">
        <div className="audio-chat-messages" ref={chatMessagesRef}>
          {messages.map((msg) => (
            <div key={msg.id} className={`audio-chat-bubble ${msg.type}`}>
              <div
                className="audio-bubble-content"
                style={
                  msg.id === "welcome"
                    ? { fontWeight: "700", fontSize: "1.1em" }
                    : {}
                }
              >
                {/* Thinking 상태일 때 점 3개 애니메이션 표시 */}
                {msg.status === "thinking" ? (
                  <>
                    <div className="thinking-dots">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                    <span>{msg.text}</span>
                  </>
                ) : (
                  <>
                    {/* [New] Welcome 메시지일 때 이미지 추가 */}
                    {msg.id === "welcome" && (
                      <img
                        src="/cook-peu-image.png"
                        alt="Peu"
                        style={{ height: "35px" }}
                      />
                    )}
                    {msg.text}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {errorMsg && <div className="audio-error-msg">{errorMsg}</div>}
    </RecipeLayout>
  );
}
