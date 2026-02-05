// src/pages/Chat/ChatPage.jsx
import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import ButtonRed from "@/components/ButtonRed";
import "./ChatPage.css";

// 볼드 포맷팅 함수
function formatBoldText(text) {
  return text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
}

export default function ChatPage() {
  const navigate = useNavigate();
  const location = useLocation();

  // 재생성 버튼에서 넘어온 경우
  const {
    sessionId: existingSessionId,
    existingMessages,
    memberInfo: existingMemberInfo,
    skipToChat,
    fromRegenerate,
  } = location.state || {};

  const [messages, setMessages] = useState(existingMessages || []);
  const [input, setInput] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isThinking, setIsThinking] = useState(false);

  // 플로우 상태
  const [flowState, setFlowState] = useState(
    skipToChat ? "FREE_CHAT" : existingMessages ? "FREE_CHAT" : "LOADING",
  );

  const [familyMembers, setFamilyMembers] = useState({});
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [combinedMemberInfo, setCombinedMemberInfo] = useState(
    existingMemberInfo || null,
  );

  // 레시피 생성 버튼 활성화
  const [hasRecipeGenerated, setHasRecipeGenerated] = useState(
    !!existingMessages || skipToChat,
  );

  const wsRef = useRef(null);
  const sessionIdRef = useRef(existingSessionId || crypto.randomUUID());
  const sessionId = sessionIdRef.current;
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const API_URL = import.meta.env.VITE_API_URL || "";
  const WS_URL = import.meta.env.VITE_WS_URL || "";

  // 디버깅용
  useEffect(() => {
    console.log("[ChatPage] 세션 ID:", sessionId);
    console.log("[ChatPage] 재생성 여부:", !!existingSessionId);
    console.log("[ChatPage] skipToChat:", skipToChat);
    console.log("[ChatPage] 현재 상태:", flowState);
  }, [sessionId, existingSessionId, skipToChat, flowState]);

  // 스크롤 최하단
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  // "나"만 자동 선택하고 바로 개인화 정보 표시
  useEffect(() => {
    if (existingMemberInfo || skipToChat) {
      console.log("[ChatPage] 기존 세션 복원 (skipToChat)");
      return;
    }

    console.log("[ChatPage] 개인화 정보 로딩 시작 (나 자동 선택)...");

    // 로그인된 회원 정보 가져오기
    const memberStr = localStorage.getItem("member");
    const member = memberStr ? JSON.parse(memberStr) : null;
    const memberId = member?.id || 0;
    const memberNickname = member?.nickname || "나";

    // "나"만 자동 선택하여 바로 개인화 정보 로드
    const loadMyPersonalization = async () => {
      try {
        // 본인 개인화 정보 로드
        const profileRes = await fetch(
          `${API_URL}/api/user/profile?member_id=${memberId}`,
        );
        const profileData = await profileRes.json();

        // 조리도구 로드
        let memberUtensils = [];
        if (memberId > 0) {
          const utensilRes = await fetch(
            `${API_URL}/api/user/all-constraints?member_id=${memberId}`,
          );
          const utensilData = await utensilRes.json();
          memberUtensils = utensilData.utensils || [];
        }

        const combined = {
          names: ["나"],
          member_id: memberId,
          allergies: profileData.allergies || [],
          dislikes: profileData.dislikes || [],
          cooking_tools: memberUtensils,
        };

        setCombinedMemberInfo(combined);

        // 개인화 정보가 있는 항목만 표시
        let infoLines = [`[ ${memberNickname} ]님을 위한 요리 정보\n`];

        if (combined.allergies.length > 0) {
          infoLines.push(`- 알레르기: ${combined.allergies.join(", ")}\n`);
        }
        if (combined.dislikes.length > 0) {
          infoLines.push(`- 싫어하는 음식: ${combined.dislikes.join(", ")}\n`);
        }
        if (combined.cooking_tools.length > 0) {
          infoLines.push(
            `- 사용 가능한 조리도구: ${combined.cooking_tools.join(", ")}\n`,
          );
        }

        // 개인화 정보 유무 확인
        const hasPersonalization =
          combined.allergies.length > 0 ||
          combined.dislikes.length > 0 ||
          combined.cooking_tools.length > 0;

        if (!hasPersonalization) {
          infoLines.push(
            `\n아직 등록된 개인화 정보가 없어요.\n마이페이지에서 알레르기, 비선호 음식 등을 등록해보세요!`,
          );
        } else {
          infoLines.push(`\n이 정보가 맞나요?`);
        }

        const infoText = infoLines.join("\n");

        setMessages([
          {
            role: "assistant",
            content: infoText,
            timestamp: new Date().toISOString(),
            showButtons: true,
            buttonType: hasPersonalization ? "confirm_info" : "start_cooking",
          },
        ]);

        setFlowState("CONFIRM_INFO");
      } catch (err) {
        console.error("[ChatPage] 개인화 정보 로딩 실패:", err);
        // 에러 시에도 요리 시작 가능하도록
        setCombinedMemberInfo({
          names: ["나"],
          member_id: memberId,
          allergies: [],
          dislikes: [],
          cooking_tools: [],
        });

        setMessages([
          {
            role: "assistant",
            content:
              "개인화 정보를 불러오지 못했어요.\n그래도 요리를 시작할 수 있어요!",
            timestamp: new Date().toISOString(),
            showButtons: true,
            buttonType: "start_cooking",
          },
        ]);

        setFlowState("CONFIRM_INFO");
      }
    };

    loadMyPersonalization();
  }, [API_URL, existingMemberInfo, skipToChat]);

  // WebSocket 연결
  useEffect(() => {
    if (flowState !== "FREE_CHAT") {
      console.log("[ChatPage] WebSocket 대기 중... 현재:", flowState);
      return;
    }

    console.log("[ChatPage] WebSocket 연결 시작...");
    const ws = new WebSocket(`${WS_URL}/api/chat/ws/${sessionId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[WebSocket] Connected");
      setIsConnected(true);

      if (combinedMemberInfo) {
        ws.send(
          JSON.stringify({
            type: "init_context",
            member_info: combinedMemberInfo,
          }),
        );

        if (!existingMessages && !skipToChat) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content:
                '어떤 요리를 만들고 싶으세요? 자유롭게 말씀해주세요!\n예) "매운 찌개 먹고 싶어요", "간식으로 먹을 요리 알려줘"',
              timestamp: new Date().toISOString(),
            },
          ]);
        }
      }
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log("[WebSocket] Received:", data);

      if (data.type === "agent_message") {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.content,
            timestamp: new Date().toISOString(),
            image_url: data.image_url,
          },
        ]);
        setIsThinking(false);
        setHasRecipeGenerated(true);
      } else if (data.type === "not_recipe_related") {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.content,
            timestamp: new Date().toISOString(),
            showHomeButton: true,
          },
        ]);
        setIsThinking(false);
        setHasRecipeGenerated(false);
      } else if (data.type === "thinking") {
        setIsThinking(true);
      } else if (data.type === "progress") {
        console.log("[Progress]", data.message);
      } else if (data.type === "error") {
        console.error("Error:", data.message);
        alert(data.message);
        setIsThinking(false);
      }
    };

    ws.onclose = () => {
      console.log("[WebSocket] Disconnected");
      setIsConnected(false);
    };

    ws.onerror = (error) => {
      console.error("[WebSocket] Error:", error);
      setIsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [
    flowState,
    combinedMemberInfo,
    sessionId,
    WS_URL,
    existingMessages,
    skipToChat,
  ]);

  // 가족 선택
  const handleSelectMember = (memberName) => {
    setSelectedMembers((prev) =>
      prev.includes(memberName)
        ? prev.filter((name) => name !== memberName)
        : [...prev, memberName],
    );
  };

  // 선택 완료
  const handleConfirmSelection = async () => {
    if (selectedMembers.length === 0) {
      alert("최소 1명을 선택해주세요.");
      return;
    }

    try {
      // 로그인된 회원 정보
      const memberStr = localStorage.getItem("member");
      const member = memberStr ? JSON.parse(memberStr) : null;
      const memberId = member?.id || 0;

      // 선택된 멤버들의 개인화 정보 수집
      const allMemberInfo = [];

      for (const name of selectedMembers) {
        const info = familyMembers[name];
        if (!info) continue;

        if (info.type === "member") {
          // 본인 - /api/user/profile에서 로드
          const res = await fetch(
            `${API_URL}/api/user/profile?member_id=${memberId}`,
          );
          const data = await res.json();
          allMemberInfo.push({
            allergies: data.allergies || [],
            dislikes: data.dislikes || [],
            cooking_tools: [],
          });
        } else {
          // 가족 - /api/user/family/{family_id}에서 로드
          const res = await fetch(`${API_URL}/api/user/family/${info.id}`);
          const data = await res.json();
          allMemberInfo.push({
            allergies: data.allergies || [],
            dislikes: data.dislikes || [],
            cooking_tools: [],
          });
        }
      }

      // 조리도구 로드 (회원 전체에 속함)
      let memberUtensils = [];
      if (memberId > 0) {
        const utensilRes = await fetch(
          `${API_URL}/api/user/all-constraints?member_id=${memberId}`,
        );
        const utensilData = await utensilRes.json();
        memberUtensils = utensilData.utensils || [];
      }

      const combined = {
        names: selectedMembers,
        member_id: memberId,
        allergies: [
          ...new Set(allMemberInfo.flatMap((m) => m.allergies || [])),
        ],
        dislikes: [...new Set(allMemberInfo.flatMap((m) => m.dislikes || []))],
        cooking_tools: memberUtensils,
      };

      setCombinedMemberInfo(combined);

      const namesText = selectedMembers.join(", ");

      // 개인화 정보가 있는 항목만 표시
      let infoLines = [`[ ${namesText} ]님을 위한 요리 정보\n`];

      if (combined.allergies.length > 0) {
        infoLines.push(`- 알레르기: ${combined.allergies.join(", ")}\n`);
      }
      if (combined.dislikes.length > 0) {
        infoLines.push(`- 싫어하는 음식: ${combined.dislikes.join(", ")}\n`);
      }
      if (combined.cooking_tools.length > 0) {
        infoLines.push(
          `- 사용 가능한 조리도구: ${combined.cooking_tools.join(", ")}\n`,
        );
      }

      // 개인화 정보 유무 확인
      const hasPersonalization =
        combined.allergies.length > 0 ||
        combined.dislikes.length > 0 ||
        combined.cooking_tools.length > 0;

      if (!hasPersonalization) {
        // 개인화 정보 없음 - 안내 메시지만
        infoLines.push(
          `\n아직 등록된 개인화 정보가 없어요.\n마이페이지에서 알레르기, 비선호 음식 등을 등록해보세요!`,
        );
      } else {
        // 개인화 정보 있음 - 확인 질문
        infoLines.push(`\n이 정보가 맞나요?`);
      }

      const infoText = infoLines.join("\n");

      setMessages((prev) => [
        ...prev,
        {
          role: "user",
          content: namesText,
          timestamp: new Date().toISOString(),
        },
        {
          role: "assistant",
          content: infoText,
          timestamp: new Date().toISOString(),
          showButtons: true, // 항상 버튼 표시
          buttonType: hasPersonalization ? "confirm_info" : "start_cooking", // 개인화 정보 없으면 바로 시작 버튼
        },
      ]);

      setFlowState("CONFIRM_INFO");
    } catch (error) {
      console.error("[ChatPage] 멤버 정보 로딩 실패:", error);
      alert("멤버 정보를 불러올 수 없습니다.");
    }
  };

  // 정보 확인
  const handleConfirmInfo = (confirmed) => {
    if (confirmed) {
      setMessages((prev) => [
        ...prev,
        {
          role: "user",
          content: "예, 맞아요",
          timestamp: new Date().toISOString(),
        },
      ]);

      setFlowState("FREE_CHAT");
      console.log("[ChatPage] 자유 대화 상태로 전환");
    } else {
      console.log("[ChatPage] 마이페이지로 이동");
      navigate("/mypage");
    }
  };

  // 메시지 전송
  const handleSend = () => {
    if (!input.trim() || !isConnected || isThinking) return;

    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: input,
        timestamp: new Date().toISOString(),
      },
    ]);

    wsRef.current.send(
      JSON.stringify({
        type: "user_message",
        content: input,
      }),
    );

    setInput("");
    setIsThinking(true);
  };

  // 레시피 생성
  const handleGenerateRecipe = () => {
    if (!combinedMemberInfo?.names?.length) {
      alert("가족 정보가 없습니다.");
      return;
    }

    const validMessages = messages.filter(
      (m) => m.role && m.content && typeof m.content === "string",
    );

    console.log("[ChatPage] 레시피 생성 버튼 클릭");

    navigate("/loading", {
      state: {
        memberInfo: combinedMemberInfo,
        chatHistory: validMessages,
        sessionId: sessionId,
        isRegeneration: !!fromRegenerate,
      },
    });
  };

  // textarea 자동 높이 조절
  const handleTextareaChange = (e) => {
    setInput(e.target.value);

    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "48px";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  };

  return (
    <div className="chat-page">
      {/* 헤더 */}
      <button className="header-closed" onClick={() => navigate(-1)}>
        <img src="/back-icon.png" alt="닫기" className="closed-icon" />
      </button>
      <div className="chat-header">
        <h1>조리 전, 마지막으로 확인할게요</h1>
      </div>

      {/* 메시지 영역 */}
      <div className="chat-content">
        {flowState === "LOADING" && (
          <div className="loading-indicator">
            <div className="spinner"></div>
            <p>로딩 중...</p>
          </div>
        )}

        <div className="messages">
          {messages.map((msg, idx) => (
            <div key={idx}>
              <div className={`message ${msg.role}`}>
                <div
                  className="bubble"
                  dangerouslySetInnerHTML={{
                    __html: formatBoldText(msg.content),
                  }}
                />
              </div>
              {msg.image && (
                <div className="message-image-wrapper">
                  <img
                    src={msg.image}
                    alt="레시피 이미지"
                    className="message-recipe-image"
                    onError={(e) => {
                      e.target.style.display = "none";
                    }}
                  />
                </div>
              )}
              {msg.showHomeButton && (
                <div className="home-button-wrapper">
                  <button
                    className="btn-confirm-selection"
                    onClick={() => navigate("/out-chat")}
                  >
                    외부 챗봇으로 이동
                  </button>
                </div>
              )}
              {msg.showButtons && msg.buttonType === "select_member" && (
                <div className="selection-area">
                  <div className="button-group">
                    {Object.keys(familyMembers).map((name) => (
                      <button
                        key={name}
                        className={`btn-option ${selectedMembers.includes(name) ? "selected" : ""}`}
                        onClick={() => handleSelectMember(name)}
                      >
                        {name}
                      </button>
                    ))}
                  </div>

                  <button
                    className="btn-confirm-selection"
                    onClick={handleConfirmSelection}
                    disabled={selectedMembers.length === 0}
                  >
                    선택 완료
                  </button>
                </div>
              )}
              {msg.showButtons && msg.buttonType === "confirm_info" && (
                <div className="button-group confirm-group">
                  <button
                    className="btn-option btn-confirm"
                    onClick={() => handleConfirmInfo(true)}
                  >
                    예, 맞아요
                  </button>
                  <button
                    className="btn-option btn-edit"
                    onClick={() => handleConfirmInfo(false)}
                  >
                    수정이 필요해요
                  </button>
                </div>
              )}
              {msg.showButtons && msg.buttonType === "start_cooking" && (
                <div className="message assistant">
                  <div className="button-group confirm-group">
                    <button
                      className="btn-option btn-confirm"
                      onClick={() => handleConfirmInfo(true)}
                    >
                      요리 시작하기
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {isThinking && (
            <div className="message assistant">
              <div className="bubble thinking">
                <div className="thinking-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <span>생각 중...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 레시피 생성 버튼 */}
      {flowState === "FREE_CHAT" && (
        <div className="action-area">
          <ButtonRed
            onClick={handleGenerateRecipe}
            disabled={!hasRecipeGenerated || isThinking}
          >
            대화 종료하고 레시피 생성하기
          </ButtonRed>
        </div>
      )}

      {/* 입력창 */}
      {flowState === "FREE_CHAT" && (
        <div className="chat-input-area">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyPress={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={isConnected ? "어떤 요리를 원하세요?" : "연결 중..."}
            disabled={!isConnected || isThinking}
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || !isConnected || isThinking}
          >
            전송
          </button>
        </div>
      )}
    </div>
  );
}
