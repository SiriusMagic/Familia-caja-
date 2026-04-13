import { Home, Users, HandCoins, Shield, UserCircle } from "lucide-react";
import { useLang } from "@/context/LanguageContext";

const tabs = [
  { key: "home", icon: Home, labelKey: "nav_home" },
  { key: "members", icon: Users, labelKey: "nav_members" },
  { key: "loans", icon: HandCoins, labelKey: "nav_loans" },
  { key: "insurance", icon: Shield, labelKey: "nav_insurance" },
  { key: "profile", icon: UserCircle, labelKey: "nav_profile" },
];

export default function BottomNav({ active, onNavigate }) {
  const { t } = useLang();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-xl border-t border-slate-200 pb-safe" data-testid="bottom-nav">
      <div className="flex justify-between items-center h-16 px-4 max-w-lg mx-auto">
        {tabs.map(({ key, icon: Icon, labelKey }) => {
          const isActive = active === key;
          return (
            <button
              key={key}
              data-testid={`nav-${key}`}
              onClick={() => onNavigate(key)}
              className={`flex flex-col items-center gap-0.5 transition-colors duration-200 min-w-[48px] ${
                isActive ? "text-teal-700" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
              <span className={`text-[10px] ${isActive ? "font-bold" : "font-medium"}`}>{t(labelKey)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
