"use client";

import { useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";
import RecipeLayout from "@/layouts/RecipeLayout";
import "./CookCompletePage.css";

export default function CookCompletePage() {
  const navigate = useNavigate();
  const location = useLocation();

  // 전달받은 데이터 (ingredients, steps 포함)
  const recipe = location.state?.recipe || {
    name: "바지락양념칼국수",
    image: "/default-food.jpg",
    ingredients: [],
    steps: [],
  };
  const elapsedTime = location.state?.elapsedTime || 874; // 00:14:34 = 874초

  // 디버깅: 전달받은 recipe 데이터 확인
  console.log("[CookCompletePage] 전달받은 recipe:", recipe);
  console.log("[CookCompletePage] ingredients:", recipe.ingredients);
  console.log("[CookCompletePage] steps:", recipe.steps);

  const [rating, setRating] = useState(2); // 기본 별점 2개
  const [saveStatus, setSaveStatus] = useState(null); // null | "success" | "fail"

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const API_URL = import.meta.env.VITE_API_URL || "";

  // 로그인된 회원 정보
  const memberStr =
    typeof window !== "undefined" ? localStorage.getItem("member") : null;
  const member = memberStr ? JSON.parse(memberStr) : null;
  const memberId = member?.id || 0;

  const handleSaveRecipe = async () => {
    try {
      // 저장할 레시피 데이터 (ingredients, steps 명시적으로 포함)
      const recipeData = {
        name: recipe.name || recipe.title,
        title: recipe.name || recipe.title,
        image: recipe.image || "",
        ingredients: recipe.ingredients || [],
        steps: recipe.steps || [],
      };

      const payload = {
        user_id: memberId,
        recipe: recipeData,
        constraints: {},
        rating: rating,
      };

      console.log("저장 요청 데이터:", JSON.stringify(payload, null, 2));

      console.log(
        "[CookCompletePage] 저장 요청 데이터:",
        JSON.stringify(payload, null, 2),
      );
      console.log(
        "[CookCompletePage] ingredients 개수:",
        recipeData.ingredients.length,
      );
      console.log("[CookCompletePage] steps 개수:", recipeData.steps.length);

      const response = await fetch(`${API_URL}/api/recipe/save-my-recipe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      console.log("응답 상태:", response.status);

      if (response.ok) {
        const data = await response.json();
        console.log("레시피 저장 성공:", data);
        setSaveStatus("success");
        setTimeout(() => setSaveStatus(null), 2500);
      } else {
        const errorText = await response.text();
        console.error("저장 실패 응답:", errorText);
        setSaveStatus("fail");
        setTimeout(() => setSaveStatus(null), 2500);
      }
    } catch (error) {
      console.error("레시피 저장 에러:", error);
      setSaveStatus("fail");
      setTimeout(() => setSaveStatus(null), 2500);
    }
  };

  const handleSkip = () => {
    navigate("/home");
  };

  return (
    <RecipeLayout steps={[]} showBottomSheet={false}>
      {/* 타이틀 섹션 */}
      <div className="complete-title-section">
        <h1 className="complete-title">오늘의 요리가 끝났어요</h1>
        <p className="complete-subtitle">레시피를 전달드릴게요</p>
      </div>

      {/* 레시피 정보 카드 */}
      <div className="complete-recipe-card">
        <h2 className="complete-recipe-name">{recipe.name}</h2>
        <p className="complete-recipe-time">
          총 소요시간 {formatTime(elapsedTime)}
        </p>
      </div>

      {/* 음식 이미지 */}
      <div className="complete-food-image-wrapper">
        <img
          src={recipe.image || "/default-food.jpg"}
          alt={recipe.name}
          className="complete-food-image"
          onError={(e) => {
            e.target.src = "https://via.placeholder.com/238x289?text=Food";
          }}
        />
        {/* 토스트 (이미지 하단 오버레이) */}
        {saveStatus && (
          <div
            className={`complete-saved-toast ${saveStatus === "fail" ? "fail" : ""}`}
          >
            {saveStatus === "success" && (
              <img
                src="/cook-complete-alert.png"
                alt="완료"
                className="complete-saved-icon"
              />
            )}
            <span className="complete-saved-text">
              {saveStatus === "success" ? "담기 완료!" : "저장 실패"}
            </span>
          </div>
        )}
      </div>

      {/* 별점 */}
      <div className="complete-rating">
        {[1, 2, 3].map((star) => (
          <button
            key={star}
            className={`star-btn ${star <= rating ? "filled" : ""}`}
            onClick={() => setRating(star)}
          >
            {star <= rating ? "★" : "☆"}
          </button>
        ))}
      </div>

      {/* 버튼 영역 */}
      <div className="complete-buttons">
        {memberId !== 0 ? (
          <button className="btn-save" onClick={handleSaveRecipe}>
            마이레시피에
            <br />
            담을래요
          </button>
        ) : (
          <button className="btn-save" disabled style={{ opacity: 0.5 }}>
            저장 불가
            <br />
            (로그인 필요)
          </button>
        )}
        <button className="btn-skip" onClick={handleSkip}>
          안담을래요
        </button>
      </div>
    </RecipeLayout>
  );
}
