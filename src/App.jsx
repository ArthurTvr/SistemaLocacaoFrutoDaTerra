import { Navigate, Route, Routes } from "react-router";
import { useAuth } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Equipamentos from "./pages/Equipamentos";
import Locacoes from "./pages/Locacoes";
import SolicitarLocacao from "./pages/SolicitarLocacao";

export default function App() {
  const { user, loadingAuth } = useAuth();

  if (loadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Carregando...
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/solicitar" element={<SolicitarLocacao />} />

      <Route
        path="/login" 
        element={user ? <Navigate to="/" replace /> : <Login />}
      />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="equipamentos" element={<Equipamentos />} />
        <Route path="locacoes" element={<Locacoes />} />
      </Route>
    </Routes>
  );
}

