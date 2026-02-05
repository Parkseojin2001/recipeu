import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "";

export default function NaverCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code || !state) {
      setError("네이버 로그인 응답이 올바르지 않습니다.");
      return;
    }

    // CSRF state 검증
    const savedState = sessionStorage.getItem("naver_oauth_state");
    if (savedState && savedState !== state) {
      setError("인증 상태가 일치하지 않습니다. 다시 시도해주세요.");
      return;
    }
    sessionStorage.removeItem("naver_oauth_state");

    // 백엔드에 code 전달 → 토큰 교환 + 회원 upsert
    const callbackUrl = `${window.location.origin}/naver-callback`;
    const params = new URLSearchParams({ code, state, callback_url: callbackUrl });

    fetch(`${API_URL}/api/auth/callback?${params.toString()}`, { method: "POST" })
      .then((res) => {
        if (!res.ok) throw new Error("로그인 처리 실패");
        return res.json();
      })
      .then((data) => {
        // 회원 정보를 로컬스토리지에 저장
        localStorage.setItem("member", JSON.stringify(data.member));
        navigate("/home");
      })
      .catch((err) => {
        console.error("네이버 로그인 콜백 처리 실패:", err);
        setError("로그인 처리 중 오류가 발생했습니다.");
      });
  }, [searchParams, navigate]);

  if (error) {
    return (
      <div style={{ padding: 32, textAlign: "center" }}>
        <p>{error}</p>
        <button onClick={() => navigate("/")} style={{ marginTop: 16 }}>
          돌아가기
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 32, textAlign: "center" }}>
      <p>로그인 처리 중...</p>
    </div>
  );
}
