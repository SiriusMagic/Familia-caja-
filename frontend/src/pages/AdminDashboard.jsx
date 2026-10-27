import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LanguageContext";
import Logo from "@/components/Logo";
import { DollarSign, Users, HandCoins, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";

export default function AdminDashboard() {
  const { api } = useAuth();
  const { t } = useLang();
  const [stats, setStats] = useState(null);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [dashRes, usersRes, paymentsRes] = await Promise.all([
        api.get("/api/admin/dashboard"),
        api.get("/api/admin/pending-users"),
        api.get("/api/admin/payments/pending"),
      ]);
      setStats(dashRes.data);
      setPendingUsers(usersRes.data);
      setPendingPayments(paymentsRes.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [api]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleUserAction = async (userId, action) => {
    try {
      await api.post(`/api/admin/users/${userId}/${action}`);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || "Error");
    }
  };

  const handlePaymentAction = async (paymentId, action) => {
    try {
      await api.post(`/api/payments/${paymentId}/${action}`);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || "Error");
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-3 border-teal-200 border-t-teal-700 rounded-full animate-spin" /></div>;

  return (
    <div className="pb-24" data-testid="admin-dashboard">
      {/* Header */}
      <div className="bg-linear-to-br from-cyan-950 via-teal-900 to-emerald-900 rounded-b-3xl px-6 pt-6 pb-10 shadow-lg">
        <div className="flex items-center justify-between mb-6">
          <Logo size="sm" />
          <span className="text-teal-200 text-xs font-medium px-3 py-1 bg-white/10 rounded-full" data-testid="admin-badge">Admin</span>
        </div>
        <h1 className="text-white text-xl font-bold mb-4" style={{ fontFamily: "Manrope" }} data-testid="admin-title">{t("admin_dashboard")}</h1>
        
        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={DollarSign} label={t("total_cash")} value={`$${(stats?.caja_total || 0).toLocaleString("en", { minimumFractionDigits: 2 })}`} testId="stat-caja-total" />
          <StatCard icon={HandCoins} label={t("active_loans")} value={`$${(stats?.prestamos_activos || 0).toLocaleString("en", { minimumFractionDigits: 2 })}`} testId="stat-prestamos" />
          <StatCard icon={Users} label={t("pending_members")} value={stats?.socios_pendientes || 0} highlight testId="stat-pending" />
          <StatCard icon={Clock} label={t("pending_payments")} value={stats?.pagos_pendientes || 0} testId="stat-pagos" />
        </div>
      </div>

      {/* Alerts */}
      <div className="px-4 -mt-4 space-y-4">
        <h2 className="text-lg font-bold text-slate-900 mt-6 mb-2" style={{ fontFamily: "Manrope" }} data-testid="alerts-title">
          <AlertCircle size={18} className="inline mr-2 text-amber-500" />
          {t("action_alerts")}
        </h2>

        {/* Pending Payments */}
        {pendingPayments.map((p) => (
          <div key={p._id} className="bg-white rounded-2xl border border-slate-200/60 shadow-xs p-4" data-testid={`pending-payment-${p._id}`}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t("payment_approval")}</span>
                <p className="text-lg font-bold text-slate-900">${p.amount?.toLocaleString("en", { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-sm">
                {p.user_name?.[0]?.toUpperCase()}
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-1">{p.user_name}</p>
            {p.note && <p className="text-xs text-slate-400 mb-3">{p.note}</p>}
            <div className="flex gap-2">
              <button data-testid={`approve-payment-${p._id}`} onClick={() => handlePaymentAction(p._id, "approve")}
                className="flex-1 h-10 rounded-lg font-medium bg-emerald-600 hover:bg-emerald-500 text-white active:scale-95 transition-all flex items-center justify-center gap-1">
                <CheckCircle size={16} /> {t("approve")}
              </button>
              <button data-testid={`reject-payment-${p._id}`} onClick={() => handlePaymentAction(p._id, "reject")}
                className="flex-1 h-10 rounded-lg font-medium bg-rose-600 hover:bg-rose-500 text-white active:scale-95 transition-all flex items-center justify-center gap-1">
                <XCircle size={16} /> {t("reject")}
              </button>
            </div>
          </div>
        ))}

        {/* Pending Users */}
        {pendingUsers.map((u) => (
          <div key={u._id} className="bg-white rounded-2xl border border-slate-200/60 shadow-xs p-4" data-testid={`pending-user-${u._id}`}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t("registration_approval")}</span>
                <p className="text-lg font-bold text-slate-900">{u.name}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-sm">
                {u.name?.[0]?.toUpperCase()}
              </div>
            </div>
            <p className="text-xs text-slate-400 mb-3">{u.email}</p>
            <div className="flex gap-2">
              <button data-testid={`approve-user-${u._id}`} onClick={() => handleUserAction(u._id, "approve")}
                className="flex-1 h-10 rounded-lg font-medium bg-emerald-600 hover:bg-emerald-500 text-white active:scale-95 transition-all flex items-center justify-center gap-1">
                <CheckCircle size={16} /> {t("approve")}
              </button>
              <button data-testid={`reject-user-${u._id}`} onClick={() => handleUserAction(u._id, "reject")}
                className="flex-1 h-10 rounded-lg font-medium bg-rose-600 hover:bg-rose-500 text-white active:scale-95 transition-all flex items-center justify-center gap-1">
                <XCircle size={16} /> {t("reject")}
              </button>
            </div>
          </div>
        ))}

        {pendingPayments.length === 0 && pendingUsers.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-xs p-8 text-center" data-testid="no-pending">
            <CheckCircle size={40} className="text-emerald-400 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">{t("no_pending")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, highlight, testId }) {
  return (
    <div className={`rounded-xl p-4 ${highlight ? "bg-amber-500/20 border border-amber-400/30" : "bg-white/10 border border-white/10"}`} data-testid={testId}>
      <Icon size={18} className={highlight ? "text-amber-300 mb-1" : "text-teal-200 mb-1"} />
      <p className="text-[11px] text-teal-200 font-medium uppercase tracking-wider">{label}</p>
      <p className="text-xl font-bold text-white mt-0.5" style={{ fontFamily: "IBM Plex Sans" }}>{value}</p>
    </div>
  );
}
