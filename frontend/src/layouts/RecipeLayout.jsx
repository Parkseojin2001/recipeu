// src/layouts/RecipeLayout.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import RecipeBottomSheet from "@/components/RecipeBottomSheet";
import "./RecipeLayout.css";

export default function RecipeLayout({
  children,
  steps = [],
  currentStep = 1,
  showBottomSheet = true,
  onStepClick = null,  // 클릭 핸들러 (CookModePage에서만 전달)
}) {
  const navigate = useNavigate();
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  return (
    <div className="recipe-layout-container">
      {/* 오버레이 */}
      <div
        className={`recipe-overlay ${isSheetOpen ? "active" : ""}`}
        onClick={() => setIsSheetOpen(false)}
      />

      {/* 헤더 - 마스코트 + 닫기 버튼 */}
      <div className="recipe-header">
        <img
          src="/chef-mascot.png"
          alt="요리사 마스코트"
          className="recipe-mascot"
        />
        <button className="recipe-close" onClick={() => navigate("/home")}>
          <img src="/exit-icon.png" alt="닫기" className="close-icon" />
        </button>
      </div>

      {/* 메인 카드 */}
      <div className="main-recipe-card">
        {/* 스크롤 가능한 콘텐츠 영역 */}
        <div className="main-recipe-card-content">{children}</div>

        {/* 레시피 전체보기 - 옵션 */}
        {showBottomSheet && steps.length > 0 && (
          <RecipeBottomSheet
            steps={steps}
            currentStep={currentStep}
            isOpen={isSheetOpen}
            setIsOpen={setIsSheetOpen}
            onStepClick={onStepClick}
          />
        )}
      </div>
    </div>
  );
}
