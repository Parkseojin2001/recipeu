# backend/features/recipe/service.py
"""
Recipe 비즈니스 로직
"""
from typing import List, Dict, Any
from .prompts import RECIPE_QUERY_EXTRACTION_PROMPT, RECIPE_GENERATION_PROMPT

class RecipeService:
    def __init__(self, rag_system, recipe_db, user_profile=None):
        self.rag = rag_system
        self.db = recipe_db
        self.user_profile = user_profile or {}
    
    async def generate_recipe(
        self, 
        chat_history: List[Dict[str, str]],
        member_info: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """상세 레시피 생성 (대화 기반)"""
        
        print(f"[RecipeService] 레시피 생성 시작")
        print(f"[RecipeService] 대화 개수: {len(chat_history)}")
        print(f"[RecipeService] 가족 정보: {member_info}")
        
        # 1. LLM으로 대화 분석 + 검색 쿼리 생성
        search_query = self._extract_search_query_with_llm(chat_history, member_info)
        
        print(f"[RecipeService] 생성된 검색 쿼리: {search_query}")
        
        # 2. RAG 검색
        retrieved_docs = self.rag.search_recipes(search_query, k=10, use_rerank=True)
        
        print(f"[RecipeService] RAG 검색 결과: {len(retrieved_docs)}개")
        
        # 3. 알레르기/비선호 필터링
        filtered_docs = self._filter_by_constraints(retrieved_docs, member_info)
        
        print(f"[RecipeService] 필터링 후: {len(filtered_docs)}개")
        
        # 4. LLM으로 최종 레시피 생성
        recipe_json = self._generate_final_recipe_with_llm(
            chat_history=chat_history,
            member_info=member_info,
            context_docs=filtered_docs
        )
        
        # 5. DB 저장
        if self.db:
            try:
                recipe_id = self.db.save_recipe(
                    user_id=member_info.get('names', ['사용자'])[0] if member_info else '사용자',
                    recipe=recipe_json,
                    constraints=member_info or {}
                )
                print(f"[RecipeService] DB 저장 완료: ID={recipe_id}")
                recipe_json['recipe_id'] = recipe_id
            except Exception as e:
                print(f"[RecipeService] DB 저장 실패: {e}")
        
        return recipe_json
    
    def _extract_search_query_with_llm(
        self, 
        chat_history: List[Dict],
        member_info: Dict
    ) -> str:
        """LLM으로 검색 쿼리 추출"""
        
        conversation = "\n".join([
            f"{msg['role']}: {msg['content']}"
            for msg in chat_history[-10:]
        ])
        
        servings = len(member_info.get('names', [])) if member_info else 1
        allergies = ', '.join(member_info.get('allergies', [])) if member_info else '없음'
        dislikes = ', '.join(member_info.get('dislikes', [])) if member_info else '없음'
        
        # 프롬프트 사용
        prompt = RECIPE_QUERY_EXTRACTION_PROMPT.format(
            conversation=conversation,
            servings=servings,
            allergies=allergies,
            dislikes=dislikes
        )
        
        from langchain_naver import ChatClovaX
        llm = ChatClovaX(model="HCX-003", temperature=0.1, max_tokens=50)
        
        try:
            result = llm.invoke(prompt)
            query = result.content.strip()
            print(f"[RecipeService] LLM 추출 쿼리: {query}")
            return query
        except Exception as e:
            print(f"[RecipeService] 쿼리 추출 실패: {e}")
            return self._simple_keyword_extraction(chat_history)
    
    def _simple_keyword_extraction(self, chat_history: List[Dict]) -> str:
        """간단한 키워드 추출 (Fallback)"""
        food_keywords = []
        
        for msg in chat_history:
            if msg.get('role') == 'user':
                content = msg.get('content', '').lower()
                if any(k in content for k in ['찌개', '국', '탕', '볶음', '구이', '조림']):
                    words = content.split()
                    food_keywords.extend([w for w in words if len(w) > 1])
        
        return ' '.join(food_keywords[:5]) if food_keywords else "한식 요리"
    
    def _filter_by_constraints(
        self,
        recipes: List[Dict],
        member_info: Dict
    ) -> List[Dict]:
        """알레르기/비선호 필터링"""
        
        if not member_info:
            return recipes[:5]
        
        filtered = []
        
        for recipe in recipes:
            content = recipe.get("content", "").lower()
            
            # 알레르기 체크
            if member_info.get("allergies"):
                has_allergen = any(
                    allergen.lower() in content 
                    for allergen in member_info["allergies"]
                )
                if has_allergen:
                    continue
            
            # 비선호 재료 체크
            if member_info.get("dislikes"):
                has_dislike = any(
                    dislike.lower() in content 
                    for dislike in member_info["dislikes"]
                )
                if has_dislike:
                    continue
            
            filtered.append(recipe)
            
            if len(filtered) >= 5:
                break
        
        if len(filtered) < 3:
            return recipes[:3]
        
        return filtered
    
    def _generate_final_recipe_with_llm(
        self,
        chat_history: List[Dict],
        member_info: Dict,
        context_docs: List[Dict]
    ) -> Dict:
        """LLM으로 최종 레시피 JSON 생성"""
        
        conversation = "\n".join([
            f"{msg['role']}: {msg['content']}"
            for msg in chat_history
        ])
        
        context_text = "\n\n".join([
            f"[레시피 {i+1}] {doc.get('title')}\n{doc.get('content', '')[:800]}"
            for i, doc in enumerate(context_docs[:5])
        ])
        
        servings = len(member_info.get('names', [])) if member_info else 1
        allergies = ', '.join(member_info.get('allergies', [])) if member_info else '없음'
        dislikes = ', '.join(member_info.get('dislikes', [])) if member_info else '없음'
        tools = ', '.join(member_info.get('tools', [])) if member_info else '모든 도구'
        
        # 프롬프트 사용
        prompt = RECIPE_GENERATION_PROMPT.format(
            conversation=conversation,
            servings=servings,
            allergies=allergies,
            dislikes=dislikes,
            tools=tools,
            context=context_text
        )
        
        from langchain_naver import ChatClovaX
        llm = ChatClovaX(model="HCX-003", temperature=0.2, max_tokens=2000)
        
        try:
            result = llm.invoke(prompt)
            response_text = result.content.strip()
            
            # JSON 추출
            import json
            import re
            
            # 마크다운 코드 블록 제거
            response_text = re.sub(r'```json\s*|\s*```', '', response_text)
            
            recipe_json = json.loads(response_text)
            
            print(f"[RecipeService] 레시피 생성 성공: {recipe_json.get('title')}")
            return recipe_json
            
        except json.JSONDecodeError as e:
            print(f"[RecipeService] JSON 파싱 실패: {e}")
            print(f"[RecipeService] 응답: {response_text[:200]}")
            
            # Fallback
            return {
                "title": "추천 레시피",
                "intro": "레시피 생성 중 오류가 발생했습니다.",
                "cook_time": "30분",
                "level": "중급",
                "servings": f"{servings}인분",
                "ingredients": [],
                "steps": [],
                "tips": []
            }
        
        except Exception as e:
            print(f"[RecipeService] 레시피 생성 실패: {e}")
            import traceback
            traceback.print_exc()
            raise