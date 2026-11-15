import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/auth.js";

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b-4 border-ink bg-ink">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link to={user ? "/dashboard" : "/"} className="flex items-center gap-2">
            <span className="brut-badge bg-acid text-ink">KLIK</span>
            <span className="font-display text-xl font-black uppercase tracking-tight text-paper">
              kli-k.id
            </span>
          </Link>

          <nav className="flex items-center gap-2">
            {user ? (
              <>
                <Link
                  to="/dashboard"
                  className="brut-btn brut-btn-acid !border-paper !px-4 !py-2 !text-xs"
                >
                  Dasbor
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="brut-btn brut-btn-ghost !px-4 !py-2 !text-xs"
                >
                  Keluar
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="brut-btn brut-btn-ghost !px-4 !py-2 !text-xs">
                  Masuk
                </Link>
                <Link to="/register" className="brut-btn brut-btn-acid !px-4 !py-2 !text-xs">
                  Daftar
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {children}

      <footer className="mt-16 border-t-4 border-ink bg-ink">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 font-mono text-xs uppercase tracking-widest text-paper sm:flex-row sm:items-center sm:justify-between">
          <span>kli-k.id — pemendek tautan</span>
          <span>Dibuat untuk tautan yang tidak muat</span>
        </div>
      </footer>
    </div>
  );
}
