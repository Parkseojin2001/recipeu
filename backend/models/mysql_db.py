# backend/models/mysql_db.py
"""
MySQL 연결 관리 - 전체 테이블 CRUD
Tables: member, family, personalization, utensil, member_utensil,
        session, chatbot, generate, my_recipe, voice
"""
import json
import logging
import pymysql
from contextlib import contextmanager
from typing import Optional, List
from app.config import settings

# 로거 설정
logger = logging.getLogger("mysql_db")
logger.setLevel(logging.DEBUG)

# 콘솔 핸들러 (컬러 로그)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setLevel(logging.DEBUG)
    formatter = logging.Formatter(
        "\033[36m[MySQL]\033[0m %(asctime)s - %(levelname)s - %(message)s",
        datefmt="%H:%M:%S"
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)


def get_mysql_connection():
    """MySQL 커넥션 생성"""
    return pymysql.connect(
        host=settings.MYSQL_HOST,
        port=settings.MYSQL_PORT,
        user=settings.MYSQL_USER,
        password=settings.MYSQL_PASSWORD,
        database=settings.MYSQL_DATABASE,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )


@contextmanager
def mysql_cursor():
    """MySQL 커서 컨텍스트 매니저"""
    conn = get_mysql_connection()
    try:
        cursor = conn.cursor()
        yield cursor
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


def init_all_tables():
    """모든 필요한 테이블 자동 생성 (서버 시작 시 호출)"""
    logger.info("🔧 [init] 모든 테이블 자동 생성 시작...")
    with mysql_cursor() as cur:
        # 1. member 테이블
        cur.execute("""
            CREATE TABLE IF NOT EXISTS member (
                id INT AUTO_INCREMENT PRIMARY KEY,
                naver_id VARCHAR(100) UNIQUE,
                email VARCHAR(255),
                nickname VARCHAR(100),
                mem_photo VARCHAR(500),
                to_cnt INT DEFAULT 1,
                frst_visit TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_visit TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        """)

        # 2. family 테이블
        cur.execute("""
            CREATE TABLE IF NOT EXISTS family (
                id INT AUTO_INCREMENT PRIMARY KEY,
                member_id INT NOT NULL,
                relationship VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_member_id (member_id)
            )
        """)

        # 3. personalization 테이블
        cur.execute("""
            CREATE TABLE IF NOT EXISTS personalization (
                id INT AUTO_INCREMENT PRIMARY KEY,
                member_id INT,
                family_id INT,
                scope ENUM('MEMBER', 'FAMILY') DEFAULT 'MEMBER',
                allergies JSON,
                dislikes JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_member_id (member_id),
                INDEX idx_family_id (family_id)
            )
        """)

        # 4. utensil 테이블
        cur.execute("""
            CREATE TABLE IF NOT EXISTS utensil (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # 5. member_utensil 테이블
        cur.execute("""
            CREATE TABLE IF NOT EXISTS member_utensil (
                id INT AUTO_INCREMENT PRIMARY KEY,
                member_id INT NOT NULL,
                utensil_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_member_utensil (member_id, utensil_id)
            )
        """)

        # 6. session 테이블
        cur.execute("""
            CREATE TABLE IF NOT EXISTS session (
                session_id INT AUTO_INCREMENT PRIMARY KEY,
                member_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_member_id (member_id)
            )
        """)

        # 7. chatbot 테이블
        cur.execute("""
            CREATE TABLE IF NOT EXISTS chatbot (
                chat_id INT AUTO_INCREMENT PRIMARY KEY,
                member_id INT NOT NULL,
                session_id INT NOT NULL,
                role ENUM('user', 'assistant') NOT NULL,
                text TEXT,
                type VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_session_id (session_id),
                INDEX idx_member_id (member_id)
            )
        """)

        # 8. generate 테이블
        cur.execute("""
            CREATE TABLE IF NOT EXISTS generate (
                generate_id INT AUTO_INCREMENT PRIMARY KEY,
                session_id INT NOT NULL,
                member_id INT NOT NULL,
                recipe_name VARCHAR(255),
                ingredients JSON,
                steps JSON,
                gen_type VARCHAR(50),
                gen_order INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_session_id (session_id),
                INDEX idx_member_id (member_id)
            )
        """)

        # 9. my_recipe 테이블
        cur.execute("""
            CREATE TABLE IF NOT EXISTS my_recipe (
                my_recipe_id INT AUTO_INCREMENT PRIMARY KEY,
                member_id INT NOT NULL,
                session_id INT,
                generate_id INT,
                recipe_name VARCHAR(255),
                ingredients JSON,
                steps JSON,
                rating INT DEFAULT 0,
                image_url VARCHAR(500),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_member_id (member_id)
            )
        """)

        # 10. voice 테이블
        cur.execute("""
            CREATE TABLE IF NOT EXISTS voice (
                voice_id INT AUTO_INCREMENT PRIMARY KEY,
                chat_id INT NOT NULL,
                member_id INT NOT NULL,
                voice_type VARCHAR(50),
                context TEXT,
                voice_file VARCHAR(500),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_chat_voice (chat_id, voice_type),
                INDEX idx_chat_id (chat_id),
                INDEX idx_member_id (member_id)
            )
        """)

    logger.info("🔧 [init] 모든 테이블 생성 완료!")


def _serialize_datetime(row: dict) -> dict:
    """datetime 필드를 ISO 문자열로 변환"""
    if not row:
        return row
    for key in ("frst_visit", "last_visit", "created_at", "updated_at"):
        if row.get(key):
            row[key] = row[key].isoformat()
    return row


# ══════════════════════════════════════════════════════════════
# member 테이블
# ══════════════════════════════════════════════════════════════

def upsert_member(profile: dict) -> dict:
    """
    네이버 프로필 기반 회원 upsert.
    - 신규: INSERT + to_cnt=1
    - 기존: to_cnt += 1, last_visit 갱신
    """
    logger.info(f"👤 [member] upsert 시도 - naver_id: {profile.get('naver_id')}, email: {profile.get('email')}")
    with mysql_cursor() as cur:
        cur.execute("SELECT * FROM member WHERE naver_id = %s", (profile["naver_id"],))
        row = cur.fetchone()

        if row:
            logger.info(f"👤 [member] 기존 회원 업데이트 - id: {row['id']}, to_cnt: {row['to_cnt']} → {row['to_cnt']+1}")
            cur.execute(
                """
                UPDATE member
                SET to_cnt     = to_cnt + 1,
                    last_visit = NOW(),
                    name       = %s,
                    nickname   = %s,
                    mem_photo  = %s,
                    gender     = %s,
                    birthday   = %s,
                    age        = %s,
                    birth_year = %s
                WHERE naver_id = %s
                """,
                (
                    profile["name"],
                    profile["nickname"],
                    profile["mem_photo"],
                    profile["gender"],
                    profile["birthday"],
                    profile["age"],
                    profile["birth_year"],
                    profile["naver_id"],
                ),
            )
            cur.execute("SELECT * FROM member WHERE naver_id = %s", (profile["naver_id"],))
            row = cur.fetchone()
        else:
            logger.info(f"👤 [member] 신규 회원 INSERT - email: {profile.get('email')}")
            cur.execute(
                """
                INSERT INTO member
                    (naver_id, email, name, nickname, mem_photo, gender, birthday, age, birth_year, to_cnt)
                VALUES
                    (%s, %s, %s, %s, %s, %s, %s, %s, %s, 1)
                """,
                (
                    profile["naver_id"],
                    profile["email"],
                    profile["name"],
                    profile["nickname"],
                    profile["mem_photo"],
                    profile["gender"],
                    profile["birthday"],
                    profile["age"],
                    profile["birth_year"],
                ),
            )
            cur.execute("SELECT * FROM member WHERE naver_id = %s", (profile["naver_id"],))
            row = cur.fetchone()

    serialized = _serialize_datetime(row)
    if serialized:
        upsert_member_personalization(serialized["id"], [], [])
    return serialized


def get_member_by_id(member_id: int) -> Optional[dict]:
    """회원 ID로 조회"""
    with mysql_cursor() as cur:
        cur.execute("SELECT * FROM member WHERE id = %s", (member_id,))
        row = cur.fetchone()
    return _serialize_datetime(row)


# ══════════════════════════════════════════════════════════════
# family 테이블
# ══════════════════════════════════════════════════════════════

def get_families(member_id: int) -> list:
    """회원의 가족 목록 조회"""
    with mysql_cursor() as cur:
        cur.execute(
            "SELECT * FROM family WHERE member_id = %s ORDER BY id",
            (member_id,),
        )
        return cur.fetchall()


def add_family(member_id: int, relationship: str = "") -> dict:
    """가족 추가"""
    logger.info(f"👨‍👩‍👧 [family] INSERT - member_id: {member_id}, relationship: {relationship}")
    with mysql_cursor() as cur:
        cur.execute(
            "INSERT INTO family (member_id, relationship) VALUES (%s, %s)",
            (member_id, relationship),
        )
        new_id = cur.lastrowid
        logger.info(f"👨‍👩‍👧 [family] INSERT 완료 - family_id: {new_id}")
        cur.execute("SELECT * FROM family WHERE id = %s", (new_id,))
        return cur.fetchone()


def update_family(family_id: int, relationship: str) -> dict:
    """가족 관계 수정"""
    logger.info(f"👨‍👩‍👧 [family] UPDATE - family_id: {family_id}, relationship: {relationship}")
    with mysql_cursor() as cur:
        cur.execute(
            "UPDATE family SET relationship = %s WHERE id = %s",
            (relationship, family_id),
        )
        cur.execute("SELECT * FROM family WHERE id = %s", (family_id,))
        return cur.fetchone()


def delete_family(family_id: int):
    """가족 삭제 (CASCADE로 personalization도 삭제)"""
    logger.warning(f"👨‍👩‍👧 [family] DELETE - family_id: {family_id} (CASCADE: personalization도 삭제)")
    with mysql_cursor() as cur:
        cur.execute("DELETE FROM family WHERE id = %s", (family_id,))


# ══════════════════════════════════════════════════════════════
# personalization 테이블
# ══════════════════════════════════════════════════════════════

def _parse_personalization(row: dict) -> dict:
    """personalization row의 JSON 필드 파싱"""
    if row:
        row["allergies"] = json.loads(row["allergies"]) if row["allergies"] else []
        row["dislikes"] = json.loads(row["dislikes"]) if row["dislikes"] else []
        row = _serialize_datetime(row)
    return row


def get_member_personalization(member_id: int) -> Optional[dict]:
    """회원 본인 개인화 조회 (scope=MEMBER)"""
    with mysql_cursor() as cur:
        cur.execute(
            "SELECT * FROM personalization WHERE member_id = %s AND scope = 'MEMBER'",
            (member_id,),
        )
        return _parse_personalization(cur.fetchone())


def upsert_member_personalization(member_id: int, allergies: list, dislikes: list) -> dict:
    """회원 본인 개인화 upsert"""
    logger.info(f"🍽️ [personalization] MEMBER upsert - member_id: {member_id}")
    logger.debug(f"   allergies: {allergies}, dislikes: {dislikes}")
    allergies_json = json.dumps(allergies, ensure_ascii=False)
    dislikes_json = json.dumps(dislikes, ensure_ascii=False)

    with mysql_cursor() as cur:
        cur.execute(
            "SELECT id FROM personalization WHERE member_id = %s AND scope = 'MEMBER'",
            (member_id,),
        )
        row = cur.fetchone()

        if row:
            logger.info(f"🍽️ [personalization] UPDATE - psnl_id: {row['id']}")
            cur.execute(
                "UPDATE personalization SET allergies = %s, dislikes = %s WHERE id = %s",
                (allergies_json, dislikes_json, row["id"]),
            )
        else:
            logger.info(f"🍽️ [personalization] INSERT - member_id: {member_id}, scope: MEMBER")
            cur.execute(
                "INSERT INTO personalization (member_id, scope, allergies, dislikes) VALUES (%s, 'MEMBER', %s, %s)",
                (member_id, allergies_json, dislikes_json),
            )

        cur.execute(
            "SELECT * FROM personalization WHERE member_id = %s AND scope = 'MEMBER'",
            (member_id,),
        )
        return _parse_personalization(cur.fetchone())


def get_family_personalization(family_id: int) -> Optional[dict]:
    """가족 개인화 조회 (scope=FAMILY)"""
    with mysql_cursor() as cur:
        cur.execute(
            "SELECT * FROM personalization WHERE family_id = %s AND scope = 'FAMILY'",
            (family_id,),
        )
        return _parse_personalization(cur.fetchone())


def upsert_family_personalization(member_id: int, family_id: int, allergies: list, dislikes: list) -> dict:
    """가족 개인화 upsert"""
    logger.info(f"🍽️ [personalization] FAMILY upsert - family_id: {family_id}")
    logger.debug(f"   allergies: {allergies}, dislikes: {dislikes}")
    allergies_json = json.dumps(allergies, ensure_ascii=False)
    dislikes_json = json.dumps(dislikes, ensure_ascii=False)

    with mysql_cursor() as cur:
        cur.execute(
            "SELECT id FROM personalization WHERE family_id = %s AND scope = 'FAMILY'",
            (family_id,),
        )
        row = cur.fetchone()

        if row:
            logger.info(f"🍽️ [personalization] UPDATE - psnl_id: {row['id']}")
            cur.execute(
                "UPDATE personalization SET allergies = %s, dislikes = %s WHERE id = %s",
                (allergies_json, dislikes_json, row["id"]),
            )
        else:
            logger.info(f"🍽️ [personalization] INSERT - family_id: {family_id}, scope: FAMILY")
            cur.execute(
                "INSERT INTO personalization (member_id, family_id, scope, allergies, dislikes) VALUES (%s, %s, 'FAMILY', %s, %s)",
                (member_id, family_id, allergies_json, dislikes_json),
            )

        cur.execute(
            "SELECT * FROM personalization WHERE family_id = %s AND scope = 'FAMILY'",
            (family_id,),
        )
        return _parse_personalization(cur.fetchone())


# ══════════════════════════════════════════════════════════════
# utensil / member_utensil 테이블
# ══════════════════════════════════════════════════════════════

def get_all_utensils() -> list:
    """전체 조리도구 목록"""
    with mysql_cursor() as cur:
        cur.execute("SELECT * FROM utensil ORDER BY id")
        return cur.fetchall()


def seed_utensils(tool_names: List[str]):
    """조리도구 마스터 데이터 시딩 (중복 무시)"""
    logger.info(f"🔧 [utensil] 시딩 시작 - {len(tool_names)}개 도구")
    with mysql_cursor() as cur:
        for name in tool_names:
            cur.execute(
                "INSERT IGNORE INTO utensil (name) VALUES (%s)",
                (name,),
            )
    logger.info(f"🔧 [utensil] 시딩 완료")


def get_member_utensils(member_id: int) -> list:
    """회원이 보유한 조리도구 ID 목록"""
    with mysql_cursor() as cur:
        cur.execute(
            "SELECT utensil_id FROM member_utensil WHERE member_id = %s",
            (member_id,),
        )
        return [row["utensil_id"] for row in cur.fetchall()]


def set_member_utensils(member_id: int, utensil_ids: List[int]):
    """회원 조리도구 전체 교체"""
    logger.info(f"🔧 [member_utensil] 교체 - member_id: {member_id}, utensil_ids: {utensil_ids}")
    with mysql_cursor() as cur:
        cur.execute("DELETE FROM member_utensil WHERE member_id = %s", (member_id,))
        for uid in utensil_ids:
            cur.execute(
                "INSERT INTO member_utensil (member_id, utensil_id) VALUES (%s, %s)",
                (member_id, uid),
            )
    logger.info(f"🔧 [member_utensil] 교체 완료 - {len(utensil_ids)}개 도구")


# ══════════════════════════════════════════════════════════════
# session 테이블
# ══════════════════════════════════════════════════════════════

def create_session(member_id: int) -> dict:
    """새 세션 생성"""
    logger.info(f"💬 [session] INSERT - member_id: {member_id}")
    with mysql_cursor() as cur:
        cur.execute(
            "INSERT INTO session (member_id) VALUES (%s)",
            (member_id,),
        )
        session_id = cur.lastrowid
        logger.info(f"💬 [session] INSERT 완료 - session_id: {session_id}")
        cur.execute("SELECT * FROM session WHERE session_id = %s", (session_id,))
        return _serialize_datetime(cur.fetchone())


def get_session(session_id: int) -> Optional[dict]:
    """세션 조회"""
    with mysql_cursor() as cur:
        cur.execute("SELECT * FROM session WHERE session_id = %s", (session_id,))
        return _serialize_datetime(cur.fetchone())


def get_member_sessions(member_id: int, limit: int = 20) -> list:
    """회원의 세션 목록 조회 (최신순)"""
    with mysql_cursor() as cur:
        cur.execute(
            "SELECT * FROM session WHERE member_id = %s ORDER BY created_at DESC LIMIT %s",
            (member_id, limit),
        )
        return [_serialize_datetime(row) for row in cur.fetchall()]


# ══════════════════════════════════════════════════════════════
# chatbot 테이블
# ══════════════════════════════════════════════════════════════

def add_chat_message(
    member_id: int,
    session_id: int,
    role: str,  # 'USER' or 'AGENT'
    text: str,
    msg_type: str = "DEFAULT"  # 'GENERATE' or 'DEFAULT'
) -> dict:
    """채팅 메시지 추가"""
    logger.info(f"💬 [chatbot] INSERT - session_id: {session_id}, role: {role}, type: {msg_type}")
    logger.debug(f"   text: {text[:50]}..." if len(text) > 50 else f"   text: {text}")
    with mysql_cursor() as cur:
        cur.execute(
            """
            INSERT INTO chatbot (member_id, session_id, role, text, type)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (member_id, session_id, role, text, msg_type),
        )
        chat_id = cur.lastrowid
        logger.info(f"💬 [chatbot] INSERT 완료 - chat_id: {chat_id}")
        cur.execute("SELECT * FROM chatbot WHERE chat_id = %s", (chat_id,))
        return _serialize_datetime(cur.fetchone())


def get_session_chats(session_id: int) -> list:
    """세션의 채팅 메시지 목록 (시간순)"""
    with mysql_cursor() as cur:
        cur.execute(
            "SELECT * FROM chatbot WHERE session_id = %s ORDER BY created_at ASC",
            (session_id,),
        )
        return [_serialize_datetime(row) for row in cur.fetchall()]


def get_chat_by_id(chat_id: int) -> Optional[dict]:
    """채팅 메시지 조회"""
    with mysql_cursor() as cur:
        cur.execute("SELECT * FROM chatbot WHERE chat_id = %s", (chat_id,))
        return _serialize_datetime(cur.fetchone())


# ══════════════════════════════════════════════════════════════
# generate 테이블
# ══════════════════════════════════════════════════════════════

def create_generate(
    session_id: int,
    member_id: int,
    recipe_name: str,
    ingredients: list,
    steps: list,
    gen_type: str = "FIRST",  # 'FIRST' or 'RETRY'
    gen_order: int = 1
) -> dict:
    """생성된 레시피 저장"""
    logger.info(f"🍳 [generate] INSERT - session_id: {session_id}, recipe: {recipe_name}, type: {gen_type}")
    with mysql_cursor() as cur:
        cur.execute(
            """
            INSERT INTO generate (session_id, member_id, recipe_name, ingredients, steps, gen_type, gen_order)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                session_id,
                member_id,
                recipe_name,
                json.dumps(ingredients, ensure_ascii=False),
                json.dumps(steps, ensure_ascii=False),
                gen_type,
                gen_order,
            ),
        )
        generate_id = cur.lastrowid
        logger.info(f"🍳 [generate] INSERT 완료 - generate_id: {generate_id}")
        cur.execute("SELECT * FROM generate WHERE generate_id = %s", (generate_id,))
        row = cur.fetchone()
        row["ingredients"] = json.loads(row["ingredients"]) if row["ingredients"] else []
        row["steps"] = json.loads(row["steps"]) if row["steps"] else []
        return _serialize_datetime(row)


def get_generate(generate_id: int) -> Optional[dict]:
    """생성 레시피 조회"""
    with mysql_cursor() as cur:
        cur.execute("SELECT * FROM generate WHERE generate_id = %s", (generate_id,))
        row = cur.fetchone()
        if row:
            row["ingredients"] = json.loads(row["ingredients"]) if row["ingredients"] else []
            row["steps"] = json.loads(row["steps"]) if row["steps"] else []
            row = _serialize_datetime(row)
        return row


def get_session_generates(session_id: int) -> list:
    """세션의 생성 레시피 목록"""
    with mysql_cursor() as cur:
        cur.execute(
            "SELECT * FROM generate WHERE session_id = %s ORDER BY gen_order ASC",
            (session_id,),
        )
        results = []
        for row in cur.fetchall():
            row["ingredients"] = json.loads(row["ingredients"]) if row["ingredients"] else []
            row["steps"] = json.loads(row["steps"]) if row["steps"] else []
            results.append(_serialize_datetime(row))
        return results


# ══════════════════════════════════════════════════════════════
# my_recipe 테이블
# ══════════════════════════════════════════════════════════════

def save_my_recipe(
    member_id: int,
    recipe_name: str,
    ingredients: list,
    steps: list,
    session_id: Optional[int] = None,
    generate_id: Optional[int] = None,
    rating: Optional[int] = None,
    image_url: Optional[str] = None
) -> dict:
    """내 레시피 저장"""
    logger.info(f"📖 [my_recipe] INSERT - member_id: {member_id}, recipe: {recipe_name}")
    with mysql_cursor() as cur:
        cur.execute(
            """
            INSERT INTO my_recipe (member_id, session_id, generate_id, recipe_name, ingredients, steps, rating, image_url)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                member_id,
                session_id,
                generate_id,
                recipe_name,
                json.dumps(ingredients, ensure_ascii=False),
                json.dumps(steps, ensure_ascii=False),
                rating,
                image_url,
            ),
        )
        my_recipe_id = cur.lastrowid
        logger.info(f"📖 [my_recipe] INSERT 완료 - my_recipe_id: {my_recipe_id}")
        cur.execute("SELECT * FROM my_recipe WHERE my_recipe_id = %s", (my_recipe_id,))
        row = cur.fetchone()
        row["ingredients"] = json.loads(row["ingredients"]) if row["ingredients"] else []
        row["steps"] = json.loads(row["steps"]) if row["steps"] else []
        return _serialize_datetime(row)


def get_my_recipes(member_id: int, limit: int = 50) -> list:
    """내 레시피 목록 (최신순)"""
    with mysql_cursor() as cur:
        cur.execute(
            "SELECT * FROM my_recipe WHERE member_id = %s ORDER BY created_at DESC LIMIT %s",
            (member_id, limit),
        )
        results = []
        for row in cur.fetchall():
            row["ingredients"] = json.loads(row["ingredients"]) if row["ingredients"] else []
            row["steps"] = json.loads(row["steps"]) if row["steps"] else []
            results.append(_serialize_datetime(row))
        return results


def get_my_recipe(my_recipe_id: int) -> Optional[dict]:
    """내 레시피 상세 조회"""
    with mysql_cursor() as cur:
        cur.execute("SELECT * FROM my_recipe WHERE my_recipe_id = %s", (my_recipe_id,))
        row = cur.fetchone()
        if row:
            row["ingredients"] = json.loads(row["ingredients"]) if row["ingredients"] else []
            row["steps"] = json.loads(row["steps"]) if row["steps"] else []
            row = _serialize_datetime(row)
        return row


def update_my_recipe(
    my_recipe_id: int,
    recipe_name: Optional[str] = None,
    rating: Optional[int] = None,
    image_url: Optional[str] = None
) -> dict:
    """내 레시피 수정"""
    logger.info(f"📖 [my_recipe] UPDATE - my_recipe_id: {my_recipe_id}")
    updates = []
    params = []
    if recipe_name is not None:
        updates.append("recipe_name = %s")
        params.append(recipe_name)
    if rating is not None:
        updates.append("rating = %s")
        params.append(rating)
    if image_url is not None:
        updates.append("image_url = %s")
        params.append(image_url)

    if not updates:
        return get_my_recipe(my_recipe_id)

    params.append(my_recipe_id)
    with mysql_cursor() as cur:
        cur.execute(
            f"UPDATE my_recipe SET {', '.join(updates)} WHERE my_recipe_id = %s",
            tuple(params),
        )
        return get_my_recipe(my_recipe_id)


def delete_my_recipe(my_recipe_id: int):
    """내 레시피 삭제"""
    logger.warning(f"📖 [my_recipe] DELETE - my_recipe_id: {my_recipe_id}")
    with mysql_cursor() as cur:
        cur.execute("DELETE FROM my_recipe WHERE my_recipe_id = %s", (my_recipe_id,))
    logger.info(f"📖 [my_recipe] DELETE 완료")


# ══════════════════════════════════════════════════════════════
# voice 테이블
# ══════════════════════════════════════════════════════════════

def save_voice(
    chat_id: int,
    member_id: int,
    voice_type: str,  # 'STT' or 'TTS'
    context: Optional[str] = None,
    voice_file: Optional[str] = None
) -> dict:
    """음성 데이터 저장"""
    logger.info(f"🎤 [voice] UPSERT - chat_id: {chat_id}, type: {voice_type}")
    with mysql_cursor() as cur:
        cur.execute(
            """
            INSERT INTO voice (chat_id, member_id, voice_type, context, voice_file)
            VALUES (%s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE context = VALUES(context), voice_file = VALUES(voice_file)
            """,
            (chat_id, member_id, voice_type, context, voice_file),
        )
        cur.execute(
            "SELECT * FROM voice WHERE chat_id = %s AND voice_type = %s",
            (chat_id, voice_type),
        )
        return _serialize_datetime(cur.fetchone())


def get_chat_voices(chat_id: int) -> list:
    """채팅 메시지의 음성 데이터 목록"""
    with mysql_cursor() as cur:
        cur.execute("SELECT * FROM voice WHERE chat_id = %s", (chat_id,))
        return [_serialize_datetime(row) for row in cur.fetchall()]


# ══════════════════════════════════════════════════════════════
# 마이페이지 통합 로드
# ══════════════════════════════════════════════════════════════

def load_mypage_data(member_id: int) -> dict:
    """마이페이지 전체 데이터 조회"""
    member_psnl = get_member_personalization(member_id)
    if not member_psnl:
        member_psnl = upsert_member_personalization(member_id, [], [])
    families = get_families(member_id)
    utensils = get_all_utensils()
    member_utensil_ids = get_member_utensils(member_id)

    family_list = []
    for f in families:
        psnl = get_family_personalization(f["id"])
        family_list.append({
            "id": f["id"],
            "relationship": f.get("relationship", ""),
            "allergies": psnl["allergies"] if psnl else [],
            "dislikes": psnl["dislikes"] if psnl else [],
        })

    return {
        "personalization": {
            "allergies": member_psnl["allergies"],
            "dislikes": member_psnl["dislikes"],
        },
        "families": family_list,
        "utensils": utensils,
        "member_utensil_ids": member_utensil_ids,
    }

