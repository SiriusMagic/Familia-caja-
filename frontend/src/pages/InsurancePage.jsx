import { useLang } from "@/context/LanguageContext";
import { Shield, Construction } from "lucide-react";

export default function InsurancePage() {
  const { t } = useLang();
  return (
    <div className="pb-24 px-4 pt-6" data-testid="insurance-page">
      <h1 className="text-2xl font-bold text-slate-900 mb-6" style={{ fontFamily: "Manrope" }}>
        <Shield size={24} className="inline mr-2 text-teal-700" />
        {t("nav_insurance")}
      </h1>
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-xs p-12 text-center">
        <Construction size={48} className="text-amber-400 mx-auto mb-3" />
        <p className="text-slate-500 font-medium">Proximamente</p>
        <p className="text-slate-400 text-sm mt-1">Esta seccion estara disponible pronto</p>
      </div>
    </div>
  );
}
