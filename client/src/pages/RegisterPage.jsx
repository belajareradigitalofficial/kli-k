import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import Alert from "../components/Alert.jsx";
import { useAuth } from "../context/auth.js";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: "", email: "", password: "" });
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
      await register(form);
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
        <h1 className="text-4xl sm:text-5xl">Daftar</h1>
        <p className="mt-3 font-mono text-sm">Gratis, tanpa kartu kredit, tanpa basa-basi.</p>

        <form onSubmit={handleSubmit} className="brut-box mt-8 space-y-5 p-6">
          {error && <Alert>{error}</Alert>}

          <div>
            <label htmlFor="name" className="brut-label">
              Nama
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              required
              maxLength={100}
              value={form.name}
              onChange={update("name")}
              className="brut-input"
              placeholder="Nama kamu"
            />
          </div>

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
              autoComplete="new-password"
              required
              minLength={8}
              value={form.password}
              onChange={update("password")}
              className="brut-input"
              placeholder="Minimal 8 karakter"
            />
          </div>

          <button type="submit" disabled={busy} className="brut-btn brut-btn-acid w-full">
            {busy ? "Membuat akun…" : "Buat akun"}
          </button>
        </form>

        <p className="mt-6 font-mono text-sm">
          Sudah punya akun?{" "}
          <Link to="/login" className="font-bold underline decoration-4 underline-offset-4">
            Masuk
          </Link>
        </p>
      </div>
    </Layout>
  );
}
