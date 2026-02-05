// src/pages/MyRecipes/RecipeDetailModal.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./RecipeDetailModal.css";

export default function RecipeDetailModal({ recipe, onClose, onDelete }) {
  const navigate = useNavigate();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const recipeData =
    typeof recipe.recipe_json === "string"
      ? JSON.parse(recipe.recipe_json)
      : recipe.recipe_json || recipe;

  const title = recipeData.title || recipe.title || "";
  const cookTime = recipeData.cook_time || "";
  const level = recipeData.level || "";
  const ingredients = recipeData.ingredients || [];
  const steps = recipeData.steps || [];
  const imageUrl = recipe.image || recipeData.image || null;

  // 날짜 포맷 (YY.MM.DD)
  const createdAt = recipe.created_at
    ? (() => {
        const d = new Date(recipe.created_at);
        const yy = String(d.getFullYear()).slice(2);
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${yy}.${mm}.${dd}`;
      })()
    : "";

  // 이전 소요시간
  const prevTime = recipe.cooking_time || recipeData.cooking_time || "";
  
  // 재료를 2개 컬럼으로 나누기
  const midPoint = Math.ceil(ingredients.length / 2);
  const leftColumn = ingredients.slice(0, midPoint);
  const rightColumn = ingredients.slice(midPoint);

  // 삭제 처리
  const handleDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      if (onDelete) {
        await onDelete(recipe.id);
      }
      onClose();
    } catch (err) {
      console.error("삭제 실패:", err);
      alert("삭제에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // 요리 시작 핸들러
  const handleStartCook = () => {
    const recipeImage = imageUrl || "/default-food.jpg";
    
    navigate("/recipe-result", {
      state: {
        recipe: {
          title: title,
          intro: recipeData.intro || "",
          cook_time: cookTime,
          level: level,
          servings: recipeData.servings || "2인분",
          ingredients: ingredients,
          steps: steps,
          image: recipeImage,
        },
        imageUrl: recipeImage,
        // RecipeResultPage에서 필요한 다른 정보들 (선택사항)
        userId: null, // 필요시 props로 받아서 전달
        sessionId: null, // 저장된 레시피이므로 세션 없음
        remainingCount: 0, // 저장된 레시피는 재생성 불가
      },
    });
  };

  return (
    <div className="detail-overlay" onClick={onClose}>
      <div className="detail-page-wrap" onClick={(e) => e.stopPropagation()}>
        {/* 오렌지 클립 - 메인 클립과 동일 위치 */}
        <div className="detail-clip">
          <img src="/my-recipe-clip-orange.png" alt="clip" />
        </div>
        {/* 모달 본체 - 클립보드 보드와 동일 위치/크기 */}
        <div className="detail-modal">
          {/* 닫기 버튼 */}
          <button className="detail-close" onClick={onClose}>
              <img src="/my-recipe-close.png" alt="close" />
          </button>
          {/* 삭제 버튼 */}
          {onDelete && (
            <button
              className="detail-delete"
              onClick={() => setShowDeleteConfirm(true)}
              title="레시피 삭제"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/>
              </svg>
            </button>
          )}

          <div className="detail-content">
            {/* 날짜 */}
            {createdAt && <p className="detail-date">{createdAt}</p>}

            {/* 제목 + 밑줄 */}
            <h2 className="detail-title">{title}</h2>
            

            {/* 이전 소요시간 */}
            <p className="detail-prev-time">
              이전 소요시간 {prevTime || "00:00:00"}
            </p>

            {/* 이미지 */}
            <div className="detail-image-wrap">
              {imageUrl ? (
                <img src={imageUrl} alt={title} className="detail-image" />
              ) : (
                <div className="detail-image-placeholder">
                  <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
                    <circle
                      cx="30"
                      cy="30"
                      r="27"
                      stroke="#C4956A"
                      strokeWidth="2"
                      fill="none"
                    />
                    <path
                      d="M18 38C18 38 24 27 30 27C36 27 42 38 42 38"
                      stroke="#C4956A"
                      strokeWidth="2"
                    />
                    <circle cx="23" cy="24" r="3" fill="#C4956A" />
                  </svg>
                </div>
              )}
            </div>

            {/* 시간 & 난이도 */}
            <div className="detail-meta">
              {cookTime && (
                <span className="meta-item">
                  <img
                    src="/my-recipe-time.png"
                    alt="time"
                    className="meta-icon"
                  />
                  {cookTime}
                </span>
              )}
              {level && (
                <span className="meta-item">
                  <img
                    src="/my-recipe-level.png"
                    alt="level"
                    className="meta-icon"
                  />
                  {level}
                </span>
              )}
            </div>

            {/* 재료 */}
            <div className="detail-section">
              <h3 className="detail-section-title">재료</h3>
              <hr className="detail-section-line" />
              <div className="detail-ingredients">
                {ingredients.length > 0 ? (
                  <>
                    <div className="ingredients-columns">
                      {leftColumn.map((ing, idx) => (
                        <div key={idx} className="ingredient-item">
                          <span>• </span>
                          <span>
                            {ing.name} {ing.amount}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="ingredients-columns">
                      {rightColumn.map((ing, idx) => (
                        <div key={idx} className="ingredient-item">
                          <span>• </span>
                          <span>
                            {ing.name} {ing.amount}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="detail-empty-text">재료 정보가 없습니다</p>
                )}
              </div>
            </div>

            {/* 조리법 */}
            <div className="detail-section">
              <h3 className="detail-section-title">조리법</h3>
              <hr className="detail-section-line" />
              <ol className="detail-steps">
                {steps.length > 0 ? (
                  steps.map((step, idx) => (
                    <li key={idx} className="step-item">
                      {step.desc || step}
                    </li>
                  ))
                ) : (
                  <p className="detail-empty-text">조리법 정보가 없습니다</p>
                )}
              </ol>
            </div>
            
            {/* 하단 요리 시작 버튼 영역 */}
            <div className="detail-action-area">
              <button className="start-cook-btn" onClick={handleStartCook}>
                요리 시작하기
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* 삭제 확인 모달 */}
      {showDeleteConfirm && (
        <div className="delete-confirm-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <p className="delete-confirm-text">
              이 레시피를 삭제하시겠습니까?
            </p>
            <p className="delete-confirm-subtext">삭제된 레시피는 복구할 수 없습니다.</p>
            <div className="delete-confirm-buttons">
              <button
                className="delete-confirm-btn cancel"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                취소
              </button>
              <button
                className="delete-confirm-btn confirm"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}