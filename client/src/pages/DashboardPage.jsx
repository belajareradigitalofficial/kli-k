import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import Alert from "../components/Alert.jsx";
import CopyButton from "../components/CopyButton.jsx";
import LinkForm from "../components/LinkForm.jsx";
import { api } from "../lib/api.js";
import { stripProtocol } from "../lib/url.js";
import { useAuth } from "../context/auth.js";

const PAGE_SIZE = 10;

export default function DashboardPage() {
  const { user } = useAuth();

  const [summary, setSummary] = useState(null);
  const [links, setLinks] = useState([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    try {
      const [summaryData, listData] = await Promise.all([
        api.summary(),
        api.list({ page, limit: PAGE_SIZE, search }),
      ]);
      setError(null);
      setSummary(summaryData);
      // Status kedaluwarsa dihitung di sini (bukan saat render) supaya
      // hasilnya stabil dan tidak memanggil Date berulang saat re-render.
      const now = Date.now();
      setLinks(
        listData.items.map((item) => ({
          ...item,
          expired: item.expiresAt ? new Date(item.expiresAt).getTime() < now : false,
        })),
      );
      setMeta({ page: listData.page, totalPages: listData.totalPages, total: listData.total });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    // Fetch data saat mount / filter berubah: setState baru terjadi setelah
    // await selesai, jadi tidak ada render berantai.
    // oxlint-disable-next-line react/set-state-in-effect
    load();
  }, [load]);

  function reload() {
    setLoading(true);
    load();
  }

  function handleSearch(event) {
    event.preventDefault();
    setLoading(true);
    setPage(1);
    setSearch(searchInput.trim());
  }

  function handleCreated(link) {
    setNotice(`Tautan dibuat: ${link.shortUrl}`);
    setLoading(true);
    setPage(1);
    setSearch("");
    setSearchInput("");
  }

  async function handleToggle(link) {
    try {
      await api.update(link.id, { isActive: !link.isActive });
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(link) {
    if (!window.confirm(`Hapus tautan ${link.slug}? Tindakan ini tidak bisa dibatalkan.`)) {
      return;
    }
    try {
      await api.remove(link.id);
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest">Dasbor</p>
            <h1 className="mt-1 text-4xl sm:text-5xl">Halo, {user?.name}</h1>
          </div>
        </header>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <StatBox label="Total tautan" value={summary?.totalLinks ?? "—"} />
          <StatBox label="Tautan aktif" value={summary?.activeLinks ?? "—"} />
          <StatBox label="Total klik" value={summary?.totalClicks ?? "—"} accent />
        </div>

        <div className="mt-8 space-y-4">
          {error && <Alert>{error}</Alert>}
          {notice && (
            <Alert tone="success">
              <span className="flex flex-wrap items-center justify-between gap-3">
                <span className="break-all">{notice}</span>
                <button
                  type="button"
                  onClick={() => setNotice(null)}
                  className="font-mono text-xs uppercase underline"
                >
                  Tutup
                </button>
              </span>
            </Alert>
          )}
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1.4fr]">
          <LinkForm onCreated={handleCreated} />

          <section>
            <form onSubmit={handleSearch} className="flex gap-3">
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="brut-input"
                placeholder="Cari alias, judul, atau URL…"
                aria-label="Cari tautan"
              />
              <button type="submit" className="brut-btn brut-btn-ink !px-4 !py-2 !text-xs">
                Cari
              </button>
            </form>

            <div className="mt-6 space-y-4">
              {loading && <p className="font-mono text-sm uppercase tracking-widest">Memuat…</p>}

              {!loading && links.length === 0 && (
                <div className="brut-box-sm p-6 text-center">
                  <p className="font-mono text-sm">
                    {search ? "Tidak ada tautan yang cocok." : "Belum ada tautan. Buat yang pertama."}
                  </p>
                </div>
              )}

              {!loading &&
                links.map((link) => (
                  <article key={link.id} className="brut-box-sm p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="brut-badge bg-acid">/{link.slug}</span>
                          {!link.isActive && <span className="brut-badge bg-ink text-paper">Nonaktif</span>}
                          {link.expired && (
                            <span className="brut-badge bg-ink text-paper">Kedaluwarsa</span>
                          )}
                        </div>
                        <p className="mt-2 truncate font-mono text-sm">{link.title || link.targetUrl}</p>
                        <p className="mt-1 truncate font-mono text-xs opacity-70">{link.targetUrl}</p>
                      </div>

                      <div className="text-right">
                        <p className="font-mono text-2xl font-black">{link.clicks}</p>
                        <p className="font-mono text-[10px] uppercase tracking-widest">klik</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <CopyButton value={stripProtocol(link.shortUrl)} />
                      <Link
                        to={`/dashboard/links/${link.id}`}
                        className="brut-btn brut-btn-ghost !px-4 !py-2 !text-xs"
                      >
                        Detail
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleToggle(link)}
                        className="brut-btn brut-btn-ghost !px-4 !py-2 !text-xs"
                      >
                        {link.isActive ? "Nonaktifkan" : "Aktifkan"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(link)}
                        className="brut-btn brut-btn-ink !px-4 !py-2 !text-xs"
                      >
                        Hapus
                      </button>
                    </div>
                  </article>
                ))}
            </div>

            {meta.totalPages > 1 && (
              <nav className="mt-6 flex items-center justify-between" aria-label="Navigasi halaman">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={meta.page <= 1}
                  className="brut-btn brut-btn-ghost !px-4 !py-2 !text-xs"
                >
                  Sebelumnya
                </button>
                <span className="font-mono text-xs uppercase tracking-widest">
                  {meta.page} / {meta.totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                  disabled={meta.page >= meta.totalPages}
                  className="brut-btn brut-btn-ghost !px-4 !py-2 !text-xs"
                >
                  Berikutnya
                </button>
              </nav>
            )}
          </section>
        </div>
      </div>
    </Layout>
  );
}

function StatBox({ label, value, accent }) {
  return (
    <div className={`brut-box p-5 ${accent ? "bg-acid" : ""}`}>
      <p className="font-mono text-xs uppercase tracking-widest">{label}</p>
      <p className="mt-2 font-mono text-4xl font-black">{value}</p>
    </div>
  );
}
