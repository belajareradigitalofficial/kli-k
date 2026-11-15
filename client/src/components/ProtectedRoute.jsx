import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/auth.js";

export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-24">
        <p className="font-mono text-sm uppercase tracking-widest">MEMUAT…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
