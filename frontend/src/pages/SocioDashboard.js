import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LanguageContext";
import Logo from "@/components/Logo";
import { Wallet, TrendingDown, PiggyBank, UploadCloud, X, FileText, CheckCircle, Clock, XCircle } from "lucide-react";

export default function SocioDashboard() {
  const { api, user } = useAuth();
  const { t } = useLang();
  const [summary, setSummary] = useState({ savings: 0, debt: 0, available: 0 });
  const [payments, setPayments] = useState([]);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({ amount: "", note: "", file: null });
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [sumRes, payRes] = await Promise.all([
        api.get("/api/users/me/summary"),
        api.get("/api/payments/my"),
      ]);
      setSummary(sumRes.data);
      setPayments(payRes.data);
    } catch (err) {
      console.error(err);
    }
  }, [api]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadForm((p) => ({ ...p, file }));
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    if (!uploadForm.amount) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("amount", uploadForm.amount);
      fd.append("type", "ahorro");
      fd.append("note", uploadForm.note);
      if (uploadForm.file) fd.append("receipt", uploadForm.file);
      await api.post("/api/payments", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setShowUpload(false);
      setUploadForm({ amount: "", note: "", file: null });
      setPreview(null);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || "Error");
    }
    setUploading(false);
  };

  const statusIcon = (s) => {
    if (s === "approved") return <CheckCircle size={14} className="text-emerald-500" />;
    if (s === "rejected") return <XCircle size={14} className="text-rose-500" />;
    return <Clock size={14} className="text-amber-500" />;
  };

  return (
    <div className="pb-24" data-testid="socio-dashboard">
      {/* Header */}
      <div className="bg-gradient-to-br from-cyan-950 via-teal-900 to-emerald-900 rounded-b-3xl px-6 pt-6 pb-10 shadow-lg">
        <div className="flex items-center justify-between mb-6">
          <Logo size="sm" />
          <span className="text-teal-200 text-xs font-medium px-3 py-1 bg-white/10 rounded-full" data-testid="socio-badge">Socio</span>
        </div>
        <p className="text-teal-200 text-sm mb-1" style={{ fontFamily: "IBM Plex Sans" }}>Hola, {user?.name?.split(" ")[0]}!</p>
        <h1 className="text-white text-xl font-bold" style={{ fontFamily: "Manrope" }} data-testid="socio-title">{t("my_savings")}</h1>
      </div>

      <div className="px-4 -mt-6 space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3">
          <SummaryCard icon={PiggyBank} label={t("your_balance")} value={`$${summary.savings.toLocaleString("en", { minimumFractionDigits: 2 })}`} color="emerald" testId="balance-card" />
          <SummaryCard icon={TrendingDown} label={t("debt")} value={`$${summary.debt.toLocaleString("en", { minimumFractionDigits: 2 })}`} color="rose" testId="debt-card" />
          <SummaryCard icon={Wallet} label={t("available")} value={`$${summary.available.toLocaleString("en", { minimumFractionDigits: 2 })}`} color="teal" testId="available-card" />
        </div>

        {/* Upload Receipt Button */}
        <button data-testid="upload-receipt-btn" onClick={() => setShowUpload(true)}
          className="w-full h-14 rounded-2xl font-semibold text-white bg-gradient-to-r from-teal-700 to-emerald-700 hover:from-teal-600 hover:to-emerald-600 active:scale-[0.98] transition-all duration-200 shadow-md flex items-center justify-center gap-2 text-base">
          <UploadCloud size={20} /> {t("upload_receipt")}
        </button>

        {/* Payment History */}
        <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>{t("my_payments")}</h2>
        {payments.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-8 text-center">
            <FileText size={40} className="text-slate-300 mx-auto mb-2" />
            <p className="text-slate-400 text-sm">{t("no_pending")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {payments.map((p) => (
              <div key={p._id} className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4 flex items-center justify-between" data-testid={`payment-${p._id}`}>
                <div>
                  <div className="flex items-center gap-2">
                    {statusIcon(p.status)}
                    <span className="font-semibold text-slate-900">${p.amount?.toLocaleString("en", { minimumFractionDigits: 2 })}</span>
                  </div>
                  {p.note && <p className="text-xs text-slate-400 mt-0.5">{p.note}</p>}
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                  p.status === "approved" ? "bg-emerald-50 text-emerald-700" : p.status === "rejected" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"
                }`}>{t(p.status)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm" data-testid="upload-modal">
          <div className="bg-white rounded-t-3xl w-full max-w-lg p-6 shadow-2xl animate-slideUp">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>{t("upload_receipt")}</h3>
              <button onClick={() => setShowUpload(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmitPayment} className="space-y-4">
              <input data-testid="payment-amount" type="number" step="0.01" min="0.01" value={uploadForm.amount} onChange={(e) => setUploadForm((p) => ({ ...p, amount: e.target.value }))}
                placeholder={`${t("amount")} ($)`} required
                className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600" />
              <input data-testid="payment-note" value={uploadForm.note} onChange={(e) => setUploadForm((p) => ({ ...p, note: e.target.value }))}
                placeholder={t("note")}
                className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600" />
              
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:border-teal-500 transition-colors bg-slate-50">
                {preview ? (
                  <img src={preview} alt="preview" className="h-full w-full object-contain rounded-xl" />
                ) : (
                  <>
                    <UploadCloud size={28} className="text-slate-400 mb-1" />
                    <span className="text-sm text-slate-400">{t("receipt")}</span>
                  </>
                )}
                <input data-testid="payment-file" type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
              </label>

              <button data-testid="submit-payment-btn" type="submit" disabled={uploading}
                className="w-full h-12 rounded-xl font-semibold text-white bg-gradient-to-r from-teal-700 to-emerald-700 hover:from-teal-600 hover:to-emerald-600 active:scale-[0.98] transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2">
                {uploading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : t("submit_payment")}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, color, testId }) {
  const colors = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200/60",
    rose: "bg-rose-50 text-rose-700 border-rose-200/60",
    teal: "bg-teal-50 text-teal-700 border-teal-200/60",
  };
  return (
    <div className={`rounded-2xl border shadow-sm p-4 ${colors[color]}`} data-testid={testId}>
      <Icon size={18} className="mb-1 opacity-70" />
      <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-lg font-bold mt-0.5" style={{ fontFamily: "IBM Plex Sans" }}>{value}</p>
    </div>
  );
}
