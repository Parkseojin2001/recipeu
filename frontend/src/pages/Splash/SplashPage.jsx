import { useNavigate } from "react-router-dom";
import "./SplashPage.css";

const API_URL = import.meta.env.VITE_API_URL || "";

export default function SplashPage() {
  const navigate = useNavigate();

  const goHome = () => {
    navigate("/home");
  };

  const goPyuExperience = () => {
    // 퓨 사용자 정보를 localStorage에 저장
    const pyuUser = {
      id: 1, // 퓨의 고유 member_id (DB에 생성할 ID)
      nickname: "퓨",
      email: "pyu@recipeu.com",
      name: "퓨",
      profile_image: null,
    };

    localStorage.setItem("member", JSON.stringify(pyuUser));
    navigate("/home");
  };

  const goNaverLogin = async () => {
    try {
      const callbackUrl = `${window.location.origin}/naver-callback`;
      const res = await fetch(
        `${API_URL}/api/auth/login-url?callback_url=${encodeURIComponent(callbackUrl)}`,
      );
      const data = await res.json();

      if (data.url) {
        sessionStorage.setItem("naver_oauth_state", data.state);
        window.location.href = data.url;
      }
    } catch (err) {
      console.error("네이버 로그인 URL 요청 실패:", err);
    }
  };

  return (
    <div className="splash-container">
      {/* RecipeU */}
      <p className="splash-recipeu">RecipeU</p>

      {/* 레시퓨 */}
      <div className="splash-title-row">
        <span className="splash-title-char splash-title-char--reo">레</span>
        <span className="splash-title-char splash-title-char--si">시</span>
        <span className="splash-title-char splash-title-char--pyu">퓨</span>
      </div>

      {/* 캐릭터 이미지 */}
      <img
        src="/splash-potato.png"
        alt="레시퓨 캐릭터"
        className="splash-character-img"
      />

      {/* 네이버 로그인 */}
      <button className="splash-naver-btn" onClick={goNaverLogin}>
        <img
          src="/login-naver.png"
          alt="네이버 로그인"
          className="splash-naver-btn-img"
        />
      </button>
      {/* 퓨로 체험해보기 */}
      <button className="splash-pyu-btn" onClick={goPyuExperience}>
        🥔 퓨로 체험해보기
      </button>
      {/* 로그인 없이 사용해보기 */}
      <button className="splash-guest-btn" onClick={goHome}>
        로그인 없이 사용해보기
      </button>
    </div>
  );
}
