// src/pages/Recipe/RecipeResultPage.jsx

import { useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import RecipeLayout from "@/layouts/RecipeLayout";
import ButtonRed from "@/components/ButtonRed";
import ButtonWhite from "@/components/ButtonWhite";
import "./RecipeResultPage.css";

export default function RecipeResultPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    recipe,
    userId,
    title,
    constraints,
    sessionId,
    memberInfo,
    chatHistory,
    remainingCount: initialCount,
    imageUrl,
  } = location.state || {};

  const [remainingCount, setRemainingCount] = useState(
    initialCount !== undefined ? initialCount : 1,
  );

  const [isFlipped, setIsFlipped] = useState(false);

  const API_URL = import.meta.env.VITE_API_URL || "";

  useEffect(() => {
    if (!recipe) {
      console.error("[RecipeResultPage] 레시피 데이터 없음");
      navigate("/home", { replace: true });
    } else {
      console.log("[RecipeResultPage] 받은 레시피:", recipe);
      console.log("[RecipeResultPage] 세션 ID:", sessionId);
      console.log("[RecipeResultPage] 남은 횟수:", remainingCount);
    }
  }, [recipe, navigate, sessionId, remainingCount]);

  if (!recipe) {
    return null;
  }

  // 재생성 버튼 핸들러
  const handleRegenerate = async () => {
    if (remainingCount <= 0) return;

    console.log("[RecipeResult] 재생성 버튼 클릭");

    if (!sessionId) {
      alert("세션 정보가 없습니다.");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/chat/session/${sessionId}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const sessionData = await response.json();

      console.log("[RecipeResult] 세션 복원:", sessionData);

      navigate("/chat", {
        state: {
          sessionId: sessionId,
          existingMessages: sessionData.messages,
          memberInfo: sessionData.user_constraints,
          skipToChat: true,
          fromRegenerate: true,
        },
        replace: true,
      });
    } catch (error) {
      console.error("[RecipeResult] 세션 복원 실패:", error);
      alert("대화 복원 중 오류가 발생했습니다.");
    }
  };

  const handleStartCooking = () => {
    navigate("/cook", {
      state: {
        recipe: {
          name: recipe.title,
          intro: recipe.intro,
          time: recipe.cook_time,
          level: recipe.level,
          servings: recipe.servings,
          ingredients: recipe.ingredients,
          steps: recipe.steps,
          image: recipeImage,
        },
      },
    });
  };

  const handleFlipCard = () => {
    setIsFlipped(!isFlipped);
  };

  const recipeImage =
    imageUrl || recipe?.image || recipe?.img_url || "/default-food.jpg";

  return (
    <RecipeLayout steps={recipe.steps || []} currentStep={0}>
      {/* 나머지 동일 */}
      <div className="result-title-section">
        <p className="result-subtitle">오늘의 추천 레시피는</p>
        <h1 className="result-title">
          <span className="highlight">{recipe.title}</span>{" "}
          <span className="result-subtitle">입니다</span>
        </h1>
      </div>

      <div
        className={`result-card-container ${isFlipped ? "flipped" : ""}`}
        onClick={handleFlipCard}
      >
        <div className="result-card">
          <div className="result-card-front">
            <div className="result-image-wrapper">
              <img
                className="result-image"
                src={recipeImage}
                alt={recipe.title}
                onError={(e) => {
                  console.error(
                    "[RecipeResultPage] 이미지 로드 실패:",
                    recipeImage,
                  );
                  e.target.src = "/default-food.jpg";
                }}
              />

              <div className="result-image-info">
                <div className="info-badge">
                  <img src="/time-icon.png" alt="시간" className="badge-icon" />
                  <span>{recipe.cook_time || "15분"}</span>
                </div>
                <div className="info-badge">
                  <img
                    src="/level-icon.png"
                    alt="난이도"
                    className="badge-icon"
                  />
                  <span>{recipe.level || "중급"}</span>
                </div>
              </div>

              <div className="flip-hint">
                <span>재료 보기</span>
                <span className="flip-icon">↻</span>
              </div>
            </div>
          </div>

          <div className="result-card-back">
            <div className="ingredients-wrapper">
              <h3 className="ingredients-title">필요한 재료</h3>
              <div className="ingredients-list">
                {recipe.ingredients && recipe.ingredients.length > 0 ? (
                  recipe.ingredients.map((ingredient, idx) => (
                    <div key={idx} className="ingredient-item">
                      <span className="ingredient-name">{ingredient.name}</span>
                      <span className="ingredient-amount">
                        {ingredient.amount}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="no-ingredients">재료 정보가 없습니다</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="result-actions">
        <div className="result-button-wrapper">
          <ButtonRed
            onClick={handleRegenerate}
            disabled={remainingCount === 0}
            subText={
              remainingCount > 0 ? `${remainingCount}회 남음` : "재생성 불가"
            }
          >
            다시 생성
          </ButtonRed>
        </div>
        <div className="result-button-wrapper">
          <ButtonWhite onClick={handleStartCooking}>요리 시작하기</ButtonWhite>
        </div>
      </div>
    </RecipeLayout>
  );
}
