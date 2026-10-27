import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { createApi } from "../lib/api";

const AuthContext = createContext(null);

const api = createApi();

function formatError(detail) {
  if (detail == null) return "Algo salio mal. Intenta de nuevo.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((e) => e?.msg || JSON.stringify(e)).filter(Boolean).join(" ");
  if (detail?.msg) return detail.msg;
  return String(detail);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem("af_token"));
  const [loading, setLoading] = useState(true);

  const setAuth = useCallback((userData, accessToken) => {
    if (accessToken) {
      localStorage.setItem("af_token", accessToken);
      setToken(accessToken);
      api.defaults.headers.common["Authorization"] = `Bearer ${accessToken}`;
    }
    setUser(userData);
  }, []);

  const clearAuth = useCallback(() => {
    localStorage.removeItem("af_token");
    setToken(null);
    delete api.defaults.headers.common["Authorization"];
    setUser(null);
  }, []);

  useEffect(() => {
    if (token) {
      api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      api.get("/api/auth/me")
        .then((res) => setUser(res.data))
        .catch(() => clearAuth())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = async (email, password) => {
    const { data } = await api.post("/api/auth/login", { email, password });
    setAuth(data.user, data.access_token);
    return data.user;
  };

  const register = async (form) => {
    const { data } = await api.post("/api/auth/register", form);
    return data;
  };

  const logout = async () => {
    try { await api.post("/api/auth/logout"); } catch { /* la sesión local se cierra igual */ }
    clearAuth();
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, api, formatError, isAdmin: user?.role === "admin" }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}

export { api };
