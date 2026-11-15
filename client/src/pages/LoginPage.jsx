import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import Alert from "../components/Alert.jsx";
import { useAuth } from "../context/auth.js";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  function update(field) {
    return (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      await login(form);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-md px-4 py-16">
        <h1 className="text-4xl sm:text-5xl">Masuk</h1>
        <p className="mt-3 font-mono text-sm">Kelola tautan yang sudah kamu buat.</p>

        <form onSubmit={handleSubmit} className="brut-box mt-8 space-y-5 p-6">
          {error && <Alert>{error}</Alert>}

          <div>
            <label htmlFor="email" className="brut-label">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={update("email")}
              className="brut-input"
              placeholder="nama@email.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="brut-label">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={form.password}
              onChange={update("password")}
              className="brut-input"
              placeholder="••••••••"
            />
          </div>

          <button type="submit" disabled={busy} className="brut-btn brut-btn-acid w-full">
            {busy ? "Memeriksa…" : "Masuk"}
          </button>
        </form>

        <p className="mt-6 font-mono text-sm">
          Belum punya akun?{" "}
          <Link to="/register" className="font-bold underline decoration-4 underline-offset-4">
            Daftar di sini
          </Link>
        </p>
      </div>
    </Layout>
  );
}
