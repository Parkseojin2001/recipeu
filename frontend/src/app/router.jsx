// src/app/router.jsx
import { BrowserRouter, Routes, Route } from "react-router-dom";

import SplashPage from "@/pages/Splash/SplashPage";
import HomePage from "@/pages/Home/HomePage";
import ChatPage from "@/pages/Chat/ChatPage";
import ChatPageOut from "@/pages/Chat/ChatPageOut";
import LoadingPage from "@/pages/Loading/LoadingPage";
import RecipeResultPage from "@/pages/Recipes/RecipeResultPage";
import CookModePage from "@/pages/Cook/CookModePage";
import CookModeAudioPage from "@/pages/Cook/CookModeAudioPage";
import CookCompletePage from "@/pages/Cook/CookCompletePage";
import MyRecipesPage from "@/pages/MyRecipes/MyRecipesPage";
import CookStartPage from "@/pages/Cook/CookStartPage";
import MyPage from "@/pages/MyPages/MyPage";
import NaverCallbackPage from "@/pages/NaverCallback/NaverCallbackPage";
import RankingRecipesPage from "@/pages/Rankings/RankingRecipesPage";
import FixedLayout from "@/layouts/FixedLayout";
import ScrollLayout from "@/layouts/ScrollLayout";
import MobileLayout from "@/layouts/MobileLayout";

export default function Router() {
  return (
    <BrowserRouter>
      <MobileLayout>
        <Routes>
          {/* Splash - 고정 화면 */}
          <Route
            path="/"
            element={
              <FixedLayout>
                <SplashPage />
              </FixedLayout>
            }
          />

          {/* 네이버 로그인 콜백 */}
          <Route path="/naver-callback" element={<NaverCallbackPage />} />

          {/* Home - 스크롤 화면 */}
          <Route
            path="/home"
            element={
              <ScrollLayout>
                <HomePage />
              </ScrollLayout>
            }
          />

          {/* MyPage - 알레르기, 조리 기구 정보 */}
          <Route
            path="/mypage"
            element={
              <FixedLayout>
                <MyPage />
              </FixedLayout>
            }
          />

          {/* Chat - 고정 화면 (입력창 고정) */}
          <Route
            path="/chat"
            element={
              <FixedLayout>
                <ChatPage />
              </FixedLayout>
            }
          />

          {/* Chat - 고정 화면 (입력창 고정) */}
          <Route
            path="/out-chat"
            element={
              <FixedLayout>
                <ChatPageOut />
              </FixedLayout>
            }
          />

          {/* Loading - 고정 화면 (로딩 애니메이션) */}
          <Route
            path="/loading"
            element={
              <FixedLayout>
                <LoadingPage />
              </FixedLayout>
            }
          />

          {/* Recipe Result - 고정 화면 (모달형) */}
          <Route
            path="/recipe-result"
            element={
              <FixedLayout>
                <RecipeResultPage />
              </FixedLayout>
            }
          />

          {/* Cook Start */}
          <Route
            path="/cook-start"
            element={
              <FixedLayout>
                <CookStartPage />
              </FixedLayout>
            }
          />

          {/* Cook Mode */}
          <Route
            path="/cook"
            element={
              <FixedLayout>
                <CookModePage />
              </FixedLayout>
            }
          />

          {/* Cook Mode Audio - 음성 녹음 페이지 */}
          <Route
            path="/cook-audio"
            element={
              <FixedLayout>
                <CookModeAudioPage />
              </FixedLayout>
            }
          />

          {/* Cook Complete - 요리 완료 페이지 */}
          <Route
            path="/cook-complete"
            element={
              <FixedLayout>
                <CookCompletePage />
              </FixedLayout>
            }
          />

          {/* 마이 레시피 - 스크롤 화면 */}
          <Route
            path="/recipes/my"
            element={
              <ScrollLayout>
                <MyRecipesPage />
              </ScrollLayout>
            }
          />

          {/* 랭킹 레시피 - 스크롤 화면 */}
          <Route
            path="/recipes"
            element={
              <ScrollLayout>
                <RankingRecipesPage />
              </ScrollLayout>
            }
          />
        </Routes>
      </MobileLayout>
    </BrowserRouter>
  );
}
