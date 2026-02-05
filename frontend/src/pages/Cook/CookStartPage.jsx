import { useNavigate } from "react-router-dom";
import CookStartButton from "@/components/ButtonRed";
import BottomNav from "@/components/BottomNav";
import "./CookStartPage.css";

export default function CookStartPage() {
  const navigate = useNavigate();

  const handleCookStart = () => {
    navigate("/chat");
  };

  return (
    <div className="cook-start-container">
      {/* 배경 */}
      <div className="cook-start-bg" />

      {/* 상단 텍스트 */}
      <div className="cook-start-content">
        <h1 className="cook-start-title">
          오늘 뭐 먹지? 고민 마세요,
          <br />딱 맞는 레시피를 알려드려요
        </h1>
        <p className="cook-start-desc">
          날씨, 등록한 알레르기/비선호 재료 정보에 따라
          <br />
          레시퓨가 맛있는 레시피를 생성해드려요
        </p>
      </div>

      {/* 캐릭터 (조리도구 포함) */}
      <div className="cook-start-character-section">
        <img
          src="/cook-potato-wink.png"
          alt="레시퓨 캐릭터"
          className="cook-start-character-img"
        />
      </div>

      {/* 레시피 생성하기 버튼 */}
      <div className="cook-start-btn-wrapper">
        <CookStartButton onClick={handleCookStart}>
          레시피 생성하기
        </CookStartButton>
      </div>

      <BottomNav />
    </div>
  );
}
