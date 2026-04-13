import { useState } from "react";
import "@/App.css";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { LanguageProvider } from "@/context/LanguageContext";
import LoginPage from "@/pages/LoginPage";
import AdminDashboard from "@/pages/AdminDashboard";
import SocioDashboard from "@/pages/SocioDashboard";
import LoansPage from "@/pages/LoansPage";
import MembersPage from "@/pages/MembersPage";
import InsurancePage from "@/pages/InsurancePage";
import ProfilePage from "@/pages/ProfilePage";
import BottomNav from "@/components/BottomNav";

function AppContent() {
  const { user, loading } = useAuth();
  const [activePage, setActivePage] = useState("home");

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-3 border-teal-200 border-t-teal-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  const isAdmin = user.role === "admin";

  const renderPage = () => {
    switch (activePage) {
      case "home":
        return isAdmin ? <AdminDashboard /> : <SocioDashboard />;
      case "members":
        return <MembersPage />;
      case "loans":
        return <LoansPage />;
      case "insurance":
        return <InsurancePage />;
      case "profile":
        return <ProfilePage />;
      default:
        return isAdmin ? <AdminDashboard /> : <SocioDashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50" data-testid="main-app">
      {renderPage()}
      <BottomNav active={activePage} onNavigate={setActivePage} />
    </div>
  );
}

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </LanguageProvider>
  );
}

export default App;
