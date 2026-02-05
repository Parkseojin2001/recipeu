"use client";

import { useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import RecipeLayout from "@/layouts/RecipeLayout";
import ButtonRed from "@/components/ButtonRed";
import "./CookModePage.css";

export default function CookModePage() {
  const navigate = useNavigate();
  const location = useLocation();

  // CookModeAudioPage에서 돌아올 때 currentStepIndex, elapsedTime 유지
  const passedStepIndex = location.state?.currentStepIndex ?? 0;
  const passedElapsedTime = location.state?.elapsedTime ?? 0;
  const [currentStepIndex, setCurrentStepIndex] = useState(passedStepIndex);
  const [elapsedTime, setElapsedTime] = useState(passedElapsedTime);

  // RecipeResultPage 또는 CookModeAudioPage에서 전달받은 recipe 데이터
  const recipe = location.state?.recipe || {
    name: "레시피 없음",
    intro: "",
    time: "0분",
    level: "초급",
    servings: "1인분",
    ingredients: [],
    steps: [{ step: 1, description: "레시피 정보가 없습니다." }],
  };

  const recipeSteps = recipe.steps || [];

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

  // 슬라이드 애니메이션 상태
  const [slideDir, setSlideDir] = useState(""); // "slide-left" | "slide-right" | ""
  const [isAnimating, setIsAnimating] = useState(false);

  const changeStep = (direction) => {
    if (isAnimating) return;
    const next =
      direction === "next"
        ? Math.min(currentStepIndex + 1, recipeSteps.length - 1)
        : Math.max(currentStepIndex - 1, 0);
    if (next === currentStepIndex) return;

    setIsAnimating(true);
    setSlideDir(direction === "next" ? "slide-left" : "slide-right");

    setTimeout(() => {
      setCurrentStepIndex(next);
      setSlideDir(
        direction === "next" ? "enter-from-right" : "enter-from-left",
      );

      setTimeout(() => {
        setSlideDir("");
        setIsAnimating(false);
      }, 300);
    }, 250);
  };

  const handlePrev = () => changeStep("prev");
  const handleNext = () => changeStep("next");

  const handleRecordClick = () => {
    navigate("/cook-audio", {
      state: {
        currentStepIndex,
        recipeSteps,
        recipe,
        elapsedTime,
      },
    });
  };

  const handleFinishCook = () => {
    navigate("/cook-complete", {
      state: {
        recipe,
        elapsedTime,
      },
    });
  };

  // RecipeBottomSheet용 steps - 이미 { no, desc } 형태로 옴
  const formattedSteps = recipeSteps.map((step, index) => ({
    no: step.no || index + 1,
    desc: step.desc || "",
  }));

  return (
    <RecipeLayout
      steps={formattedSteps}
      currentStep={currentStepIndex + 1}
      onStepClick={(index) => {
        if (index === currentStepIndex || isAnimating) return;
        const dir = index > currentStepIndex ? "next" : "prev";
        setIsAnimating(true);
        setSlideDir(dir === "next" ? "slide-left" : "slide-right");
        setTimeout(() => {
          setCurrentStepIndex(index);
          setSlideDir(dir === "next" ? "enter-from-right" : "enter-from-left");
          setTimeout(() => {
            setSlideDir("");
            setIsAnimating(false);
          }, 300);
        }, 250);
      }}
    >
      {/* 레시피 제목 (한 줄) */}
      <h1 className="cook-recipe-title">{recipe.name}</h1>

      {/* 소요시간 + 녹음 버튼 (한 줄, 6:4) */}
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
          <button className="cook-record-btn" onClick={handleRecordClick}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          </button>
        </div>
      </div>

      {/* 단계 설명 박스 (슬라이드 애니메이션 적용) */}
      <div className={`cook-step-box ${slideDir}`}>
        <span className="cook-step-label">
          STEP {recipeSteps[currentStepIndex]?.no || currentStepIndex + 1}
        </span>
        <p className="cook-step-description">
          {recipeSteps[currentStepIndex]?.desc || "단계 정보가 없습니다."}
        </p>
      </div>

      {/* 이미지 + 화살표 네비게이션 */}
      <div className="cook-image-nav">
        <button
          className="cook-nav-btn"
          onClick={handlePrev}
          disabled={currentStepIndex === 0 || isAnimating}
        >
          <span className="cook-arrow">‹</span>
        </button>

        <div className="cook-food-image-wrapper">
          <img
            src={
              recipeSteps[currentStepIndex]?.image ||
              recipe.image ||
              "/default-food.jpg"
            }
            alt="조리 이미지"
            className="cook-food-image"
            onError={(e) => {
              e.target.src = "https://via.placeholder.com/200?text=No+Image";
            }}
          />
        </div>

        <button
          className="cook-nav-btn"
          onClick={handleNext}
          disabled={currentStepIndex === recipeSteps.length - 1 || isAnimating}
        >
          <span className="cook-arrow">›</span>
        </button>
      </div>

      {/* 마지막 단계일 때 요리 종료하기 버튼 */}
      {currentStepIndex === recipeSteps.length - 1 && (
        <div className="cook-finish-wrapper">
          <ButtonRed onClick={handleFinishCook}>요리 종료하기</ButtonRed>
        </div>
      )}
    </RecipeLayout>
  );
}
