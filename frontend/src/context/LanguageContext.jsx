import { createContext, useContext, useState, useCallback } from "react";
import translations from "@/i18n/translations";

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem("af_lang") || "es");

  const t = useCallback(
    (key) => {
      const keys = key.split(".");
      let val = translations[lang];
      for (const k of keys) {
        val = val?.[k];
      }
      return val || key;
    },
    [lang]
  );

  const toggleLang = useCallback(() => {
    const next = lang === "es" ? "en" : "es";
    setLang(next);
    localStorage.setItem("af_lang", next);
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, t, toggleLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLang must be inside LanguageProvider");
  return ctx;
}
