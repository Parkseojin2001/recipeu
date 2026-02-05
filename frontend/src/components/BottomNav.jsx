import { useNavigate, useLocation } from "react-router-dom";
import "./BottomNav.css";

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const menus = [
    {
      path: "/home",
      label: "홈",
      activeIcon: "/nav-home-click.png",
      inactiveIcon: "/nav-home-non.png",
    },
    {
      path: "/cook-start",
      label: "조리모드",
      activeIcon: "/nav-cook-click.png",
      inactiveIcon: "/nav-cook-non.png",
    },
    {
      path: "/recipes/my",
      label: "마이 레시피",
      activeIcon: "/nav-my-click.png",
      inactiveIcon: "/nav-my-non.png",
    },
    {
      path: "/out-chat",
      label: "챗봇",
      activeIcon: "/nav-chat-click.png",
      inactiveIcon: "/nav-chat-non.png",
    },
  ];

  return (
    <nav className="bottom-nav">
      {menus.map((menu) => {
        const isActive = location.pathname === menu.path;

        return (
          <button
            key={menu.path}
            className={`nav-item ${isActive ? "active" : ""}`}
            onClick={() => navigate(menu.path)}
          >
            <img
              src={isActive ? menu.activeIcon : menu.inactiveIcon}
              alt={menu.label}
            />
            <span>{menu.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
