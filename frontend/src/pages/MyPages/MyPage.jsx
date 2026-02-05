import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "./MyPage.css";

const API_URL = import.meta.env.VITE_API_URL || "";

export default function MyPage() {
  const navigate = useNavigate();

  // --- 로그인 회원 정보 ---
  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(true);

  // --- 상태 관리 ---
  const [currentProfile, setCurrentProfile] = useState("나");
  const [profiles, setProfiles] = useState([]); // [{id: null, name: '나'}, {id: 1, name: '딸'}]
  const [isEditing, setIsEditing] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [tagInput, setTagInput] = useState({ type: "", value: "" });

  // 프로필별 데이터: { '나': {allergies:[], dislikes:[], tools:[]}, ... }
  const [profileData, setProfileData] = useState({});

  // 전체 조리도구 목록 (DB에서 로드)
  const [allUtensils, setAllUtensils] = useState([]);

  const TOOL_METADATA = {
    밥솥: { label: "밥솥", icon: "/rice-cooker.png" },
    RICE_COOKER: { label: "밥솥", icon: "/rice-cooker.png" },
    전자레인지: { label: "전자레인지", icon: "/cooked.png", size: "100%" },
    MICROWAVE: { label: "전자레인지", icon: "/cooked.png", size: "100%" },
    오븐: { label: "오븐", icon: "/oven.png", size: "65%" },
    OVEN: { label: "오븐", icon: "/oven.png", size: "65%" },
    에어프라이어: { label: "에어프라이어", icon: "/air-fryer.png" },
    AIR_FRYER: { label: "에어프라이어", icon: "/air-fryer.png" },
    찜기: { label: "찜기", icon: "/food-steamer.png" },
    STEAMER: { label: "찜기", icon: "/food-steamer.png" },
    믹서기: { label: "믹서기", icon: "/blender.png" },
    BLENDER: { label: "믹서기", icon: "/blender.png" },
    착즙기: { label: "착즙기", icon: "/citrus-juicer.png" },
    JUICER: { label: "착즙기", icon: "/citrus-juicer.png" },
    커피머신: { label: "커피머신", icon: "/coffe-machine.png" },
    COFFEE_MACHINE: { label: "커피머신", icon: "/coffe-machine.png" },
    토스트기: { label: "토스트기", icon: "/toast-appliance.png" },
    TOASTER: { label: "토스트기", icon: "/toast-appliance.png" },
    와플메이커: { label: "와플메이커", icon: "/stovetop-waffle.png" },
    WAFFLE_MAKER: { label: "와플메이커", icon: "/stovetop-waffle.png" },
  };

  // --- 회원 정보 로드 ---
  useEffect(() => {
    const saved = localStorage.getItem("member");
    if (saved) {
      try {
        setMember(JSON.parse(saved));
      } catch {}
    }
  }, []);

  // --- API에서 마이페이지 데이터 로드 ---
  const loadMypageData = useCallback(async (memberId) => {
    if (!memberId) {
      setLoading(false);
      return;
    }

    try {
      // 마이페이지 전체 데이터 로드
      const res = await fetch(
        `${API_URL}/api/user/mypage?member_id=${memberId}`,
      );
      if (!res.ok) throw new Error("Failed to load mypage data");

      const data = await res.json();
      console.log("[MyPage] API 데이터 로드:", data);

      // 프로필 목록 구성 ('나' + 가족들)
      const newProfiles = [{ id: null, name: "나" }];
      const newProfileData = {
        나: {
          allergies: data.personalization?.allergies || [],
          dislikes: data.personalization?.dislikes || [],
          tools: data.member_utensil_ids || [], // utensil_id 배열
        },
      };

      // 가족 추가
      for (const fam of data.families || []) {
        const famName = fam.relationship || `가족${fam.id}`;
        newProfiles.push({ id: fam.id, name: famName });
        newProfileData[famName] = {
          allergies: fam.allergies || [],
          dislikes: fam.dislikes || [],
          tools: [], // 가족은 조리도구 없음
        };
      }

      setProfiles(newProfiles);
      setProfileData(newProfileData);
      setCurrentProfile("나");

      // 전체 조리도구 목록 로드
      setAllUtensils(data.utensils || []);
    } catch (err) {
      console.error("[MyPage] 데이터 로드 실패:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (member?.id) {
      loadMypageData(member.id);
    } else {
      setLoading(false);
    }
  }, [member, loadMypageData]);

  const currentData = profileData[currentProfile] || {
    allergies: [],
    dislikes: [],
    tools: [],
  };
  const currentProfileObj = profiles.find((p) => p.name === currentProfile);

  // --- 저장 실패 알림 상태 ---
  const [saveError, setSaveError] = useState(null);

  // --- API 저장 함수들 ---
  const savePersonalization = async (allergies, dislikes) => {
    if (!member?.id) return false;

    try {
      const res = await fetch(
        `${API_URL}/api/user/personalization?member_id=${member.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ allergies, dislikes }),
        },
      );
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        console.error(
          "[MyPage] 개인화 저장 실패 - status:",
          res.status,
          errBody,
        );
        setSaveError("저장에 실패했습니다. 다시 시도해주세요.");
        return false;
      }
      return true;
    } catch (err) {
      console.error("[MyPage] 개인화 저장 네트워크 오류:", err);
      setSaveError("네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.");
      return false;
    }
  };

  const saveFamilyPersonalization = async (
    familyId,
    relationship,
    allergies,
    dislikes,
  ) => {
    if (!member?.id || !familyId) return false;

    try {
      const res = await fetch(
        `${API_URL}/api/user/family/${familyId}?member_id=${member.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ relationship, allergies, dislikes }),
        },
      );
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        console.error(
          "[MyPage] 가족 개인화 저장 실패 - status:",
          res.status,
          errBody,
        );
        setSaveError("저장에 실패했습니다. 다시 시도해주세요.");
        return false;
      }
      return true;
    } catch (err) {
      console.error("[MyPage] 가족 개인화 저장 네트워크 오류:", err);
      setSaveError("네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.");
      return false;
    }
  };

  const saveUtensils = async (utensilIds) => {
    if (!member?.id) return false;

    try {
      const res = await fetch(
        `${API_URL}/api/user/utensils?member_id=${member.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ utensil_ids: utensilIds }),
        },
      );
      if (!res.ok) {
        setSaveError("조리도구 저장에 실패했습니다.");
        return false;
      }
      return true;
    } catch (err) {
      console.error("[MyPage] 조리도구 저장 실패:", err);
      setSaveError("네트워크 오류가 발생했습니다.");
      return false;
    }
  };

  // --- 프로필 관련 ---
  const handleAddProfile = async () => {
    const name = newProfileName.trim();
    if (!name || profiles.some((p) => p.name === name)) {
      setNewProfileName("");
      setShowInput(false);
      return;
    }

    if (!member?.id) {
      // 비로그인: 로컬만
      setProfiles([...profiles, { id: null, name }]);
      setProfileData({
        ...profileData,
        [name]: { allergies: [], dislikes: [], tools: [] },
      });
      setCurrentProfile(name);
    } else {
      // 로그인: API 호출
      try {
        const res = await fetch(
          `${API_URL}/api/user/family?member_id=${member.id}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ relationship: name }),
          },
        );
        const data = await res.json();

        if (data.success) {
          const newId = data.family.id;
          setProfiles([...profiles, { id: newId, name }]);
          setProfileData({
            ...profileData,
            [name]: { allergies: [], dislikes: [], tools: [] },
          });
          setCurrentProfile(name);
        }
      } catch (err) {
        console.error("[MyPage] 가족 추가 실패:", err);
      }
    }

    setNewProfileName("");
    setShowInput(false);
  };

  const confirmDelete = async () => {
    const target = profiles.find((p) => p.name === deleteTarget);
    if (!target) {
      setDeleteTarget(null);
      return;
    }

    // '나'는 삭제 불가
    if (target.id === null) {
      setDeleteTarget(null);
      return;
    }

    if (member?.id && target.id) {
      // API 호출
      try {
        await fetch(
          `${API_URL}/api/user/family/${target.id}?member_id=${member.id}`,
          {
            method: "DELETE",
          },
        );
      } catch (err) {
        console.error("[MyPage] 가족 삭제 실패:", err);
      }
    }

    const newProfiles = profiles.filter((p) => p.name !== deleteTarget);
    const newData = { ...profileData };
    delete newData[deleteTarget];

    setProfiles(newProfiles);
    setProfileData(newData);
    setCurrentProfile(newProfiles[0]?.name || "나");
    setDeleteTarget(null);
  };

  // --- 태그 관련 ---
  const addTag = async (type) => {
    const val = tagInput.value.trim();
    if (!val || currentData[type].includes(val)) {
      setTagInput({ type: "", value: "" });
      return;
    }

    const oldTags = [...currentData[type]];
    const newTags = [...currentData[type], val];
    const newProfileData = {
      ...profileData,
      [currentProfile]: { ...currentData, [type]: newTags },
    };
    setProfileData(newProfileData);
    setTagInput({ type: "", value: "" });
    setSaveError(null);

    // API 저장
    if (member?.id) {
      let success = false;
      if (currentProfileObj?.id === null) {
        // 본인
        const allergies =
          type === "allergies" ? newTags : currentData.allergies;
        const dislikes = type === "dislikes" ? newTags : currentData.dislikes;
        success = await savePersonalization(allergies, dislikes);
      } else if (currentProfileObj?.id) {
        // 가족
        const allergies =
          type === "allergies" ? newTags : currentData.allergies;
        const dislikes = type === "dislikes" ? newTags : currentData.dislikes;
        success = await saveFamilyPersonalization(
          currentProfileObj.id,
          currentProfile,
          allergies,
          dislikes,
        );
      }

      // 저장 실패 시 롤백
      if (!success && member?.id) {
        setProfileData({
          ...profileData,
          [currentProfile]: { ...currentData, [type]: oldTags },
        });
      }
    }
  };

  const removeTag = async (type, targetTag) => {
    if (!isEditing) return;

    const oldTags = [...currentData[type]];
    const newTags = currentData[type].filter((t) => t !== targetTag);
    const newProfileData = {
      ...profileData,
      [currentProfile]: { ...currentData, [type]: newTags },
    };
    setProfileData(newProfileData);
    setSaveError(null);

    // API 저장
    if (member?.id) {
      let success = false;
      if (currentProfileObj?.id === null) {
        const allergies =
          type === "allergies" ? newTags : currentData.allergies;
        const dislikes = type === "dislikes" ? newTags : currentData.dislikes;
        success = await savePersonalization(allergies, dislikes);
      } else if (currentProfileObj?.id) {
        const allergies =
          type === "allergies" ? newTags : currentData.allergies;
        const dislikes = type === "dislikes" ? newTags : currentData.dislikes;
        success = await saveFamilyPersonalization(
          currentProfileObj.id,
          currentProfile,
          allergies,
          dislikes,
        );
      }

      // 저장 실패 시 롤백
      if (!success && member?.id) {
        setProfileData({
          ...profileData,
          [currentProfile]: { ...currentData, [type]: oldTags },
        });
      }
    }
  };

  // --- 로그아웃 ---
  const handleLogout = () => {
    localStorage.removeItem("member");
    localStorage.removeItem("access_token");
    setMember(null);
    navigate("/");
  };

  // --- 조리도구 토글 (회원 소유, 프로필 무관) ---
  const toggleTool = async (utensilId) => {
    // 항상 "나" 프로필의 tools를 수정 (회원 소유)
    const myData = profileData["나"] || {
      allergies: [],
      dislikes: [],
      tools: [],
    };
    const currentTools = myData.tools || [];
    const oldTools = [...currentTools];
    const newTools = currentTools.includes(utensilId)
      ? currentTools.filter((t) => t !== utensilId)
      : [...currentTools, utensilId];

    setProfileData({
      ...profileData,
      나: { ...myData, tools: newTools },
    });
    setSaveError(null);

    // API 저장
    if (member?.id) {
      const success = await saveUtensils(newTools);
      // 저장 실패 시 롤백
      if (!success) {
        setProfileData({
          ...profileData,
          나: { ...myData, tools: oldTools },
        });
      }
    }
  };

  if (loading) {
    return (
      <div className="mypage-page">
        <div className="mypage-scroll">
          <div className="mypage-loading">로딩 중...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mypage-page">
      <div className="mypage-scroll">
        <div className="mypage-top-nav">
          <button className="nav-btn" onClick={() => navigate(-1)}>
            <img src="/left-arrow.png" alt="뒤로" className="nav-icon" />
          </button>
        </div>

        <div className="mypage-board">
          <section className="greeting">
            <p className="hello">안녕하세요,</p>
            <h1 className="user-name">
              <span className="orange-text">
                {member ? member.nickname : "게스트"}
              </span>{" "}
              님
            </h1>

            {/* 프로필 정보 행 */}
            {member && (
              <div className="member-profile-row">
                <img
                  src={member.mem_photo}
                  alt="프로필"
                  className="member-photo-circle"
                  referrerPolicy="no-referrer"
                />
                <div className="member-info-inline">
                  <span className="member-nickname-inline">
                    {member.nickname}
                  </span>
                  <span className="member-email-inline">{member.email}</span>
                  {member.birthday && (
                    <span className="member-birthday-inline">
                      {member.birthday}
                    </span>
                  )}
                </div>
                <button className="logout-btn-inline" onClick={handleLogout}>
                  로그아웃
                </button>
              </div>
            )}

            <div className="profile-selection">
              <div className="tab-group">
                {profiles.map((p) => (
                  <div key={p.name} className="profile-tab-wrapper">
                    <button
                      className={`profile-tab ${currentProfile === p.name ? "active" : ""}`}
                      onClick={() => setCurrentProfile(p.name)}
                    >
                      {p.name}
                    </button>
                    {isEditing && p.id !== null && (
                      <span
                        className="delete-x"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(p.name);
                        }}
                      >
                        x
                      </span>
                    )}
                  </div>
                ))}
                {showInput && (
                  <input
                    className="profile-name-input"
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                    onBlur={handleAddProfile}
                    onKeyPress={(e) => e.key === "Enter" && handleAddProfile()}
                    autoFocus
                  />
                )}
              </div>
              <button className="add-btn" onClick={() => setShowInput(true)}>
                <img
                  src="add-user.png"
                  alt="add_user"
                  className="add_user-icon"
                />
              </button>
            </div>
          </section>
          <div className="scroll-content">
            {["allergies", "dislikes"].map((type) => (
              <div className="info-card" key={type}>
                <h3 className="card-title">
                  {type === "allergies" ? "알레르기" : "비선호 음식"}
                </h3>
                <div className="tag-list">
                  {currentData[type].map((t) => (
                    <span
                      key={t}
                      className={`tag ${isEditing ? "editable" : ""}`}
                      onClick={() => removeTag(type, t)}
                    >
                      #{t} {isEditing && <span className="tag-remove">×</span>}
                    </span>
                  ))}
                  {isEditing && (
                    <div className="tag-add-box">
                      <input
                        placeholder="입력"
                        value={tagInput.type === type ? tagInput.value : ""}
                        onChange={(e) =>
                          setTagInput({ type, value: e.target.value })
                        }
                        onKeyPress={(e) => e.key === "Enter" && addTag(type)}
                      />
                      <button onClick={() => addTag(type)}>+</button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            <div className="edit-btn-row">
              <button
                className={`edit-toggle ${isEditing ? "active" : ""}`}
                onClick={() => setIsEditing(!isEditing)}
              >
                {isEditing ? "수정완료" : "수정하기"}
              </button>
            </div>

            {/* 조리도구: 항상 표시 (회원 소유, 가족과 무관) */}
            <section className="tools-section">
              <h3 className="section-title">주방 및 조리 도구</h3>
              <div className="tool-grid">
                {allUtensils.map((tool) => {
                  const iconData = TOOL_METADATA[tool.name] || {
                    label: tool.name,
                    icon: "/default-tool.png",
                  };
                  // 항상 "나" 프로필의 tools 사용 (회원 소유)
                  const myTools = profileData["나"]?.tools || [];
                  return (
                    <div
                      key={tool.id}
                      className="tool-item"
                      onClick={() => toggleTool(tool.id)}
                    >
                      <div
                        className={`tool-box ${myTools.includes(tool.id) ? "selected" : ""}`}
                      >
                        <img
                          src={iconData.icon}
                          alt={iconData.label}
                          className="tool-icon-img"
                          style={
                            iconData.size
                              ? { width: iconData.size, height: iconData.size }
                              : {}
                          }
                        />
                      </div>
                      <span className="tool-label">{iconData.label}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </div>

      {deleteTarget && (
        <div className="modal-overlay">
          <div className="modal-content">
            <p className="modal-text">
              "{deleteTarget}" 프로필을
              <br />
              삭제하시겠습니까?
            </p>
            <div className="modal-buttons">
              <button
                className="modal-btn cancel"
                onClick={() => setDeleteTarget(null)}
              >
                취소
              </button>
              <button className="modal-btn confirm" onClick={confirmDelete}>
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 저장 실패 알림 */}
      {saveError && (
        <div className="save-error-toast" onClick={() => setSaveError(null)}>
          <span>{saveError}</span>
          <button className="toast-close">×</button>
        </div>
      )}
    </div>
  );
}
