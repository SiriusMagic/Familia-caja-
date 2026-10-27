import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LanguageContext";
import { UserCircle, Globe, LogOut, Mail, Phone, CreditCard } from "lucide-react";

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const { t, lang, toggleLang } = useLang();

  return (
    <div className="pb-24 px-4 pt-6" data-testid="profile-page">
      <h1 className="text-2xl font-bold text-slate-900 mb-6" style={{ fontFamily: "Manrope" }}>
        <UserCircle size={24} className="inline mr-2 text-teal-700" />
        {t("profile")}
      </h1>

      {/* User Card */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-xs p-6 mb-4">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-full bg-linear-to-br from-teal-700 to-emerald-700 flex items-center justify-center text-white font-bold text-2xl shadow-md" data-testid="profile-avatar">
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">{user?.name}</h2>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${user?.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-teal-100 text-teal-700"}`} data-testid="profile-role">
              {user?.role === "admin" ? "Admin" : "Socio"}
            </span>
          </div>
        </div>
        <div className="space-y-3 text-sm text-slate-600">
          <div className="flex items-center gap-3"><Mail size={16} className="text-slate-400" /> {user?.email}</div>
          {user?.phone && <div className="flex items-center gap-3"><Phone size={16} className="text-slate-400" /> {user?.phone}</div>}
          {user?.cedula && <div className="flex items-center gap-3"><CreditCard size={16} className="text-slate-400" /> {user?.cedula}</div>}
        </div>
      </div>

      {/* Language Toggle */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-xs p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Globe size={20} className="text-teal-700" />
            <span className="font-medium text-slate-900">{t("language")}</span>
          </div>
          <button data-testid="language-toggle" onClick={toggleLang}
            className="h-9 px-4 rounded-full text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all active:scale-95">
            {lang === "es" ? "English" : "Espanol"}
          </button>
        </div>
      </div>

      {/* Logout */}
      <button data-testid="logout-btn" onClick={logout}
        className="w-full h-12 rounded-2xl font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 active:scale-[0.98] transition-all flex items-center justify-center gap-2 border border-rose-200">
        <LogOut size={18} /> {t("logout")}
      </button>
    </div>
  );
}
