import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LanguageContext";
import { Users, Shield, UserCircle, KeyRound, ChevronDown } from "lucide-react";

export default function MembersPage() {
  const { api, isAdmin } = useAuth();
  const { t } = useLang();
  const [users, setUsers] = useState([]);
  const [expandedUser, setExpandedUser] = useState(null);
  const [newPassword, setNewPassword] = useState("");

  const fetchUsers = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const { data } = await api.get("/api/users");
      setUsers(data);
    } catch (err) {
      console.error(err);
    }
  }, [api, isAdmin]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleRoleChange = async (userId, newRole) => {
    try {
      await api.post(`/api/admin/users/${userId}/role`, { role: newRole });
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.detail || "Error");
    }
  };

  const handleResetPassword = async (userId) => {
    if (!newPassword) return;
    try {
      await api.post(`/api/admin/users/${userId}/reset-password`, { new_password: newPassword });
      setNewPassword("");
      setExpandedUser(null);
      alert("Contrasena reseteada");
    } catch (err) {
      alert(err.response?.data?.detail || "Error");
    }
  };

  if (!isAdmin) {
    return (
      <div className="pb-24 px-4 pt-6" data-testid="members-page">
        <h1 className="text-2xl font-bold text-slate-900 mb-4" style={{ fontFamily: "Manrope" }}>
          <Users size={24} className="inline mr-2 text-teal-700" />
          {t("nav_members")}
        </h1>
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-8 text-center">
          <Shield size={40} className="text-slate-300 mx-auto mb-2" />
          <p className="text-slate-400 text-sm">Solo el administrador puede ver esta seccion</p>
        </div>
      </div>
    );
  }

  const roleBadge = (role) => (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${role === "admin" ? "bg-purple-100 text-purple-700" : "bg-teal-100 text-teal-700"}`}>
      {role === "admin" ? "Admin" : "Socio"}
    </span>
  );

  const statusBadge = (status) => {
    const map = {
      active: "bg-emerald-50 text-emerald-700",
      pending: "bg-amber-50 text-amber-700",
      rejected: "bg-rose-50 text-rose-700",
      suspended: "bg-slate-100 text-slate-500",
    };
    return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[status] || map.pending}`}>{t(status)}</span>;
  };

  return (
    <div className="pb-24 px-4 pt-6" data-testid="members-page">
      <h1 className="text-2xl font-bold text-slate-900 mb-6" style={{ fontFamily: "Manrope" }}>
        <Users size={24} className="inline mr-2 text-teal-700" />
        {t("members_list")} ({users.length})
      </h1>

      <div className="space-y-2">
        {users.map((u) => (
          <div key={u._id} className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden" data-testid={`member-${u._id}`}>
            <button onClick={() => setExpandedUser(expandedUser === u._id ? null : u._id)}
              className="w-full flex items-center justify-between p-4 text-left">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-sm">
                  {u.name?.[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{u.name}</p>
                  <p className="text-xs text-slate-400">{u.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {roleBadge(u.role)}
                {statusBadge(u.status)}
                <ChevronDown size={16} className={`text-slate-400 transition-transform ${expandedUser === u._id ? "rotate-180" : ""}`} />
              </div>
            </button>

            {expandedUser === u._id && (
              <div className="border-t border-slate-100 p-4 space-y-3 bg-slate-50">
                <div className="flex gap-2">
                  <button data-testid={`role-admin-${u._id}`} onClick={() => handleRoleChange(u._id, "admin")}
                    className={`flex-1 h-9 rounded-lg text-xs font-medium transition-all ${u.role === "admin" ? "bg-purple-600 text-white" : "bg-purple-100 text-purple-700 hover:bg-purple-200"}`}>
                    <Shield size={12} className="inline mr-1" /> Admin
                  </button>
                  <button data-testid={`role-socio-${u._id}`} onClick={() => handleRoleChange(u._id, "socio")}
                    className={`flex-1 h-9 rounded-lg text-xs font-medium transition-all ${u.role === "socio" ? "bg-teal-600 text-white" : "bg-teal-100 text-teal-700 hover:bg-teal-200"}`}>
                    <UserCircle size={12} className="inline mr-1" /> Socio
                  </button>
                </div>
                <div className="flex gap-2">
                  <input value={expandedUser === u._id ? newPassword : ""} onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t("reset_password")} type="text"
                    className="flex-1 h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm" />
                  <button data-testid={`reset-pw-${u._id}`} onClick={() => handleResetPassword(u._id)}
                    className="h-9 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-xs font-medium flex items-center gap-1">
                    <KeyRound size={12} /> Reset
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
