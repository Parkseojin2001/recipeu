# services/llm.py
"""
LLM 헬퍼 함수
"""
from typing import List, Dict


def create_system_prompt(
    user_profile: Dict,
    template: str,
    **kwargs
) -> str:
    """시스템 프롬프트 생성"""
    return template.format(
        user_name=user_profile["name"],
        allergies=", ".join(user_profile["allergies"]),
        dislike=", ".join(user_profile["dislike"]),
        **kwargs
    )


def format_chat_history(messages: List[Dict], max_items: int = 4) -> str:
    """채팅 히스토리 포맷팅"""
    history_text = "\n".join([
        f"{'사용자' if msg['role'] == 'user' else '어시스턴트'}: {msg['content'][:100]}"
        for msg in messages[-max_items:]
    ])
    return history_text