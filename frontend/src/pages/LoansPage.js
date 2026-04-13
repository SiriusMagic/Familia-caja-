import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LanguageContext";
import { HandCoins, ThumbsUp, ThumbsDown, Plus, X, CheckCircle, XCircle, Clock, Vote } from "lucide-react";

export default function LoansPage() {
  const { api, user } = useAuth();
  const { t } = useLang();
  const [loans, setLoans] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ amount: "", purpose: "salud", description: "" });
  const [submitting, setSubmitting] = useState(false);

  const fetchLoans = useCallback(async () => {
    try {
      const { data } = await api.get("/api/loans");
      setLoans(data);
    } catch (err) {
      console.error(err);
    }
  }, [api]);

  useEffect(() => { fetchLoans(); }, [fetchLoans]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/api/loans", { amount: parseFloat(form.amount), purpose: form.purpose, description: form.description });
      setShowForm(false);
      setForm({ amount: "", purpose: "salud", description: "" });
      fetchLoans();
    } catch (err) {
      alert(err.response?.data?.detail || "Error");
    }
    setSubmitting(false);
  };

  const handleVote = async (loanId, vote) => {
    try {
      await api.post(`/api/loans/${loanId}/vote`, { vote });
      fetchLoans();
    } catch (err) {
      alert(err.response?.data?.detail || "Error");
    }
  };

  const statusBadge = (s) => {
    const map = {
      voting: { bg: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock },
      active: { bg: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle },
      rejected: { bg: "bg-rose-50 text-rose-700 border-rose-200", icon: XCircle },
    };
    const cfg = map[s] || map.voting;
    const Icon = cfg.icon;
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${cfg.bg}`}>
        <Icon size={12} /> {t(s)}
      </span>
    );
  };

  const purposes = ["vanidad", "salud", "educacion", "emergencia", "negocio", "otro"];

  return (
    <div className="pb-24 px-4 pt-6" data-testid="loans-page">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>
          <HandCoins size={24} className="inline mr-2 text-teal-700" />
          {t("nav_loans")}
        </h1>
        <button data-testid="request-loan-btn" onClick={() => setShowForm(true)}
          className="h-10 px-4 rounded-xl font-semibold text-white bg-gradient-to-r from-teal-700 to-emerald-700 hover:from-teal-600 hover:to-emerald-600 active:scale-95 transition-all shadow-sm flex items-center gap-1 text-sm">
          <Plus size={16} /> {t("request_loan")}
        </button>
      </div>

      {loans.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-8 text-center">
          <HandCoins size={40} className="text-slate-300 mx-auto mb-2" />
          <p className="text-slate-400 text-sm">{t("no_pending")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {loans.map((loan) => (
            <div key={loan._id} className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-4" data-testid={`loan-${loan._id}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-bold text-slate-900 text-lg">${loan.amount?.toLocaleString("en", { minimumFractionDigits: 2 })}</p>
                  <p className="text-sm text-slate-600">{loan.user_name}</p>
                </div>
                {statusBadge(loan.status)}
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {t(`loan_purposes.${loan.purpose}`)}
                </span>
              </div>
              {loan.description && <p className="text-sm text-slate-500 mb-3">{loan.description}</p>}
              
              {/* Vote Progress */}
              <div className="flex items-center gap-4 text-xs text-slate-500 mb-3">
                <span className="flex items-center gap-1"><ThumbsUp size={12} className="text-emerald-500" /> {loan.votes_for_count} {t("votes_for")}</span>
                <span className="flex items-center gap-1"><ThumbsDown size={12} className="text-rose-500" /> {loan.votes_against_count} {t("votes_against")}</span>
              </div>

              {loan.can_vote && (
                <div className="flex gap-2">
                  <button data-testid={`vote-for-${loan._id}`} onClick={() => handleVote(loan._id, "for")}
                    className="flex-1 h-10 rounded-lg font-medium bg-emerald-600 hover:bg-emerald-500 text-white active:scale-95 transition-all flex items-center justify-center gap-1 text-sm">
                    <ThumbsUp size={14} /> {t("vote_for")}
                  </button>
                  <button data-testid={`vote-against-${loan._id}`} onClick={() => handleVote(loan._id, "against")}
                    className="flex-1 h-10 rounded-lg font-medium bg-rose-600 hover:bg-rose-500 text-white active:scale-95 transition-all flex items-center justify-center gap-1 text-sm">
                    <ThumbsDown size={14} /> {t("vote_against")}
                  </button>
                </div>
              )}
              {loan.my_vote && (
                <p className="text-xs text-slate-400 mt-2 text-center">
                  {loan.my_vote === "for" ? <ThumbsUp size={12} className="inline text-emerald-500 mr-1" /> : <ThumbsDown size={12} className="inline text-rose-500 mr-1" />}
                  Ya votaste: {loan.my_vote === "for" ? t("vote_for") : t("vote_against")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* New Loan Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm" data-testid="loan-modal">
          <div className="bg-white rounded-t-3xl w-full max-w-lg p-6 shadow-2xl animate-slideUp">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>{t("request_loan")}</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input data-testid="loan-amount-input" type="number" step="0.01" min="1" value={form.amount}
                onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                placeholder={`${t("loan_amount")} ($)`} required
                className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600" />
              
              <select data-testid="loan-purpose-select" value={form.purpose}
                onChange={(e) => setForm((p) => ({ ...p, purpose: e.target.value }))}
                className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600">
                {purposes.map((p) => <option key={p} value={p}>{t(`loan_purposes.${p}`)}</option>)}
              </select>

              <textarea data-testid="loan-description-input" value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder={t("explain_loan")} rows={3}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 resize-none" />

              <button data-testid="submit-loan-btn" type="submit" disabled={submitting}
                className="w-full h-12 rounded-xl font-semibold text-white bg-gradient-to-r from-teal-700 to-emerald-700 hover:from-teal-600 hover:to-emerald-600 active:scale-[0.98] transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2">
                {submitting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : t("submit_loan")}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
