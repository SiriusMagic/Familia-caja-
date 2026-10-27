import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LanguageContext";
import Logo from "@/components/Logo";
import { Eye, EyeOff, LogIn, UserPlus } from "lucide-react";

export default function LoginPage() {
  const { login, register, formatError } = useAuth();
  const { t } = useLang();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", name: "", cedula: "", phone: "" });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(form.email, form.password);
      } else {
        const data = await register(form);
        setSuccess(data.message || t("pending_message"));
        setMode("login");
        setForm((p) => ({ ...p, password: "", name: "", cedula: "", phone: "" }));
      }
    } catch (err) {
      setError(formatError(err.response?.data?.detail) || err.message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-linear-to-br from-cyan-950 via-teal-900 to-emerald-900 h-[55%]" />
      <div className="absolute inset-0 h-[55%] opacity-20" style={{ backgroundImage: `url('https://images.unsplash.com/photo-1560520653-9e0e4c89eb11?w=800&q=60')`, backgroundSize: "cover", backgroundPosition: "center" }} />

      <div className="relative z-10 w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4">
            <Logo size="lg" />
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-8 border border-slate-200/60">
          <h2 className="text-2xl font-bold text-slate-900 mb-1" style={{ fontFamily: "Manrope" }} data-testid="auth-title">
            {mode === "login" ? t("login_title") : t("register_title")}
          </h2>
          <p className="text-slate-500 text-sm mb-6" style={{ fontFamily: "IBM Plex Sans" }}>
            {mode === "login" ? t("login_subtitle") : t("register_subtitle")}
          </p>

          {error && <div className="bg-rose-50 text-rose-700 text-sm rounded-xl p-3 mb-4 border border-rose-200" data-testid="auth-error">{error}</div>}
          {success && <div className="bg-emerald-50 text-emerald-700 text-sm rounded-xl p-3 mb-4 border border-emerald-200" data-testid="auth-success">{success}</div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <>
                <input data-testid="register-name" value={form.name} onChange={set("name")} placeholder={t("name")} required
                  className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-600 focus:border-transparent transition-all" />
                <div className="grid grid-cols-2 gap-3">
                  <input data-testid="register-cedula" value={form.cedula} onChange={set("cedula")} placeholder={t("cedula")}
                    className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-600 focus:border-transparent transition-all" />
                  <input data-testid="register-phone" value={form.phone} onChange={set("phone")} placeholder={t("phone")}
                    className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-600 focus:border-transparent transition-all" />
                </div>
              </>
            )}
            <input data-testid="login-email" value={form.email} onChange={set("email")} type="email" placeholder={t("email")} required
              className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-600 focus:border-transparent transition-all" />
            <div className="relative">
              <input data-testid="login-password" value={form.password} onChange={set("password")} type={showPw ? "text" : "password"} placeholder={t("password")} required minLength={4}
                className="w-full h-12 px-4 pr-12 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-600 focus:border-transparent transition-all" />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <button data-testid="auth-submit-btn" type="submit" disabled={loading}
              className="w-full h-12 rounded-xl font-semibold text-white bg-linear-to-r from-teal-700 to-emerald-700 hover:from-teal-600 hover:to-emerald-600 active:scale-[0.98] transition-all duration-200 shadow-md disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : mode === "login" ? <><LogIn size={18} /> {t("login")}</> : <><UserPlus size={18} /> {t("register")}</>}
            </button>
          </form>

          <div className="mt-5 text-center">
            <button data-testid="toggle-auth-mode" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); setSuccess(""); }}
              className="text-teal-700 font-semibold text-sm hover:underline">
              {mode === "login" ? t("register") : t("login")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
