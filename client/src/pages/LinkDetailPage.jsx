import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import Alert from "../components/Alert.jsx";
import CopyButton from "../components/CopyButton.jsx";
import { api } from "../lib/api.js";
import { stripProtocol } from "../lib/url.js";
import { useBaseUrl } from "../lib/useBaseUrl.js";
import { useSlugCheck } from "../lib/useSlugCheck.js";

export default function LinkDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const baseUrl = useBaseUrl();

  const [link, setLink] = useState(null);
  const [stats, setStats] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const slugCheck = useSlugCheck(form?.slug, {
    excludeId: id,
    enabled: Boolean(form) && form.slug.trim() !== "" && form.slug.trim() !== link?.slug,
  });

  const slugBlocked = slugCheck.status === "taken" || slugCheck.status === "invalid";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [linkData, statsData] = await Promise.all([api.get(id), api.stats(id)]);
      setLink(linkData);
      setStats(statsData);
      setForm({
        slug: linkData.slug,
        targetUrl: linkData.targetUrl,
        title: linkData.title ?? "",
        description: linkData.description ?? "",
        isActive: linkData.isActive,
        expiresAt: linkData.expiresAt ? toLocalInput(linkData.expiresAt) : "",
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect
    load();
  }, [load]);

  async function handleSave(event) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    if (slugBlocked) {
      setError("Alias sudah digunakan. Silakan pilih nama lain.");
      return;
    }

    setBusy(true);

    const payload = {
      targetUrl: form.targetUrl.trim(),
      title: form.title.trim() || null,
      description: form.description.trim() || null,
      isActive: form.isActive,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
    };

    // Kirim slug hanya kalau benar-benar berubah.
    if (form.slug.trim() && form.slug.trim() !== link.slug) {
      payload.slug = form.slug.trim();
    }

    try {
      await api.update(id, payload);
      setSaved(true);
      await load();
    } catch (err) {
      setError(
        err.code === "SLUG_TAKEN"
          ? "Alias sudah digunakan. Silakan pilih nama lain."
          : err.message,
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Hapus tautan ini secara permanen?")) return;
    try {
      await api.remove(id);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="mx-auto max-w-4xl px-4 py-16">
          <p className="font-mono text-sm uppercase tracking-widest">Memuat…</p>
        </div>
      </Layout>
    );
  }

  if (!link) {
    return (
      <Layout>
        <div className="mx-auto max-w-4xl px-4 py-16">
          <Alert>{error || "Tautan tidak ditemukan."}</Alert>
          <Link to="/dashboard" className="brut-btn brut-btn-ghost mt-6">
            Kembali ke dasbor
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto max-w-4xl px-4 py-10">
        <Link to="/dashboard" className="font-mono text-xs uppercase tracking-widest underline">
          ← Dasbor
        </Link>

        <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl sm:text-5xl">/{link.slug}</h1>
            <p className="mt-2 truncate font-mono text-sm opacity-70">{link.shortUrl}</p>
          </div>
          <div className="flex gap-2">
            <CopyButton value={stripProtocol(link.shortUrl)} />
            <a
              href={link.shortUrl}
              target="_blank"
              rel="noreferrer"
              className="brut-btn brut-btn-ghost !px-4 !py-2 !text-xs"
            >
              Buka
            </a>
          </div>
        </header>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <StatBox label="Klik" value={stats?.clicks ?? link.clicks} accent />
          <StatBox label="Pengunjung unik" value={stats?.uniqueVisitors ?? "—"} />
          <StatBox label="Status" value={link.isActive ? "Aktif" : "Nonaktif"} />
        </div>

        <div className="mt-8 space-y-4">
          {error && <Alert>{error}</Alert>}
          {saved && <Alert tone="success">Perubahan tersimpan.</Alert>}
        </div>

        <form onSubmit={handleSave} className="brut-box mt-6 space-y-4 p-6">
          <h2 className="text-2xl">Ubah tautan</h2>

          <div>
            <label htmlFor="slug" className="brut-label">
              Custom URL
            </label>
            <div className="flex items-stretch">
              <span className="flex items-center border-4 border-r-0 border-ink bg-ink px-3 font-mono text-xs text-paper">
                {baseUrl ? `${baseUrl}/` : "…/"}
              </span>
              <input
                id="slug"
                type="text"
                maxLength={32}
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
                className="brut-input !border-l-0"
                aria-describedby="slug-status"
              />
            </div>

            <p
              id="slug-status"
              className="mt-2 font-mono text-xs font-bold"
              aria-live="polite"
            >
              {slugCheck.status === "available" && `✓ ${slugCheck.message}`}
              {slugCheck.status === "checking" && slugCheck.message}
              {(slugCheck.status === "taken" || slugCheck.status === "invalid") &&
                `✕ ${slugCheck.message}`}
              {slugCheck.status === "idle" &&
                "Mengubah alamat akan membuat tautan lama tidak lagi berfungsi."}
            </p>
          </div>

          <div>
            <label htmlFor="targetUrl" className="brut-label">
              URL tujuan
            </label>
            <input
              id="targetUrl"
              type="url"
              required
              value={form.targetUrl}
              onChange={(e) => setForm({ ...form, targetUrl: e.target.value })}
              className="brut-input"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="title" className="brut-label">
                Judul
              </label>
              <input
                id="title"
                type="text"
                maxLength={255}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="brut-input"
              />
            </div>

            <div>
              <label htmlFor="expiresAt" className="brut-label">
                Kedaluwarsa
              </label>
              <input
                id="expiresAt"
                type="datetime-local"
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                className="brut-input"
              />
            </div>
          </div>

          <div>
            <label htmlFor="description" className="brut-label">
              Deskripsi
            </label>
            <textarea
              id="description"
              rows={3}
              maxLength={2000}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="brut-input resize-y"
            />
          </div>

          <label className="flex items-center gap-3 font-mono text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="h-5 w-5 accent-[#111]"
            />
            Tautan aktif (bisa diakses pengunjung)
          </label>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="submit"
              disabled={busy || slugBlocked}
              className="brut-btn brut-btn-acid"
            >
              {busy ? "Menyimpan…" : "Simpan perubahan"}
            </button>
            <button type="button" onClick={handleDelete} className="brut-btn brut-btn-ink">
              Hapus tautan
            </button>
          </div>
        </form>

        <section className="mt-10">
          <h2 className="text-2xl">Kunjungan terakhir</h2>
          {stats?.recentVisits?.length ? (
            <div className="brut-box mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse font-mono text-xs">
                <thead>
                  <tr className="border-b-4 border-ink bg-ink text-paper">
                    <th className="p-3 text-left uppercase tracking-widest">Waktu</th>
                    <th className="p-3 text-left uppercase tracking-widest">IP</th>
                    <th className="p-3 text-left uppercase tracking-widest">Asal</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentVisits.map((visit) => (
                    <tr key={visit.id} className="border-b-2 border-ink/20 last:border-0">
                      <td className="p-3 whitespace-nowrap">
                        {new Date(visit.createdAt).toLocaleString("id-ID")}
                      </td>
                      <td className="p-3">{visit.ip || "—"}</td>
                      <td className="max-w-[240px] truncate p-3">{visit.referer || "langsung"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="brut-box-sm mt-4 p-6 text-center">
              <p className="font-mono text-sm">Belum ada kunjungan tercatat.</p>
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}

function StatBox({ label, value, accent }) {
  return (
    <div className={`brut-box p-5 ${accent ? "bg-acid" : ""}`}>
      <p className="font-mono text-xs uppercase tracking-widest">{label}</p>
      <p className="mt-2 font-mono text-3xl font-black">{value}</p>
    </div>
  );
}

function toLocalInput(iso) {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
