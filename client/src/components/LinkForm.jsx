import { useState } from "react";
import Alert from "./Alert.jsx";
import { api } from "../lib/api.js";
import { useBaseUrl } from "../lib/useBaseUrl.js";
import { useSlugCheck } from "../lib/useSlugCheck.js";

const EMPTY = {
  targetUrl: "",
  slug: "",
  title: "",
  expiresAt: "",
};

export default function LinkForm({ onCreated, onCancel }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const baseUrl = useBaseUrl();

  const slugCheck = useSlugCheck(form.slug, { enabled: form.slug.trim() !== "" });

  function update(field) {
    return (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));
  }

  function handleSlugChange(event) {
    // Alias dipaksa huruf kecil: slug di URL bersifat case-insensitive,
    // jadi menampilkan huruf besar hanya menimbulkan kebingungan.
    setForm((prev) => ({ ...prev, slug: event.target.value.toLowerCase() }));
  }

  function randomize() {
    setForm((prev) => ({ ...prev, slug: "" }));
  }

  const slugBlocked = slugCheck.status === "taken" || slugCheck.status === "invalid";

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);

    if (slugBlocked) {
      setError("Alias sudah digunakan. Silakan pilih nama lain.");
      return;
    }

    setBusy(true);

    const payload = { targetUrl: form.targetUrl.trim() };
    if (form.slug.trim()) payload.slug = form.slug.trim();
    if (form.title.trim()) payload.title = form.title.trim();
    if (form.expiresAt) payload.expiresAt = new Date(form.expiresAt).toISOString();

    try {
      const link = await api.create(payload);
      setForm(EMPTY);
      onCreated?.(link);
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

  return (
    <form onSubmit={handleSubmit} className="brut-box space-y-4 p-6">
      <h2 className="text-2xl">Tautan baru</h2>

      {error && <Alert>{error}</Alert>}

      <div>
        <label htmlFor="targetUrl" className="brut-label">
          URL tujuan
        </label>
        <input
          id="targetUrl"
          type="url"
          required
          value={form.targetUrl}
          onChange={update("targetUrl")}
          className="brut-input"
          placeholder="https://contoh.com/halaman-panjang"
        />
      </div>

      <div>
        <div className="flex items-end justify-between gap-2">
          <label htmlFor="slug" className="brut-label">
            Custom URL
          </label>
          <button
            type="button"
            onClick={randomize}
            className="mb-1 font-mono text-[10px] uppercase tracking-widest underline"
          >
            Kosongkan (acak)
          </button>
        </div>

        <div className="flex items-stretch">
          <span className="flex items-center border-4 border-r-0 border-ink bg-ink px-3 font-mono text-xs text-paper">
            {baseUrl ? `${baseUrl}/` : "…/"}
          </span>
          <input
            id="slug"
            type="text"
            maxLength={32}
            value={form.slug}
            onChange={handleSlugChange}
            className="brut-input !border-l-0"
            placeholder="acak-otomatis"
            aria-describedby="slug-status"
          />
        </div>

        <p
          id="slug-status"
          className={`mt-2 font-mono text-xs ${
            slugCheck.status === "available"
              ? "font-bold"
              : slugCheck.status === "checking"
                ? "opacity-70"
                : "font-bold"
          }`}
          aria-live="polite"
        >
          {slugCheck.status === "available" && `✓ ${slugCheck.message}`}
          {slugCheck.status === "checking" && slugCheck.message}
          {(slugCheck.status === "taken" || slugCheck.status === "invalid") &&
            `✕ ${slugCheck.message}`}
          {slugCheck.status === "idle" &&
            "Kosongkan untuk alamat acak, atau isi nama sendiri."}
        </p>
      </div>

      <div>
        <label htmlFor="expiresAt" className="brut-label">
          Kedaluwarsa (opsional)
        </label>
        <input
          id="expiresAt"
          type="datetime-local"
          value={form.expiresAt}
          onChange={update("expiresAt")}
          className="brut-input"
        />
      </div>

      <div>
        <label htmlFor="title" className="brut-label">
          Judul (opsional)
        </label>
        <input
          id="title"
          type="text"
          maxLength={255}
          value={form.title}
          onChange={update("title")}
          className="brut-input"
          placeholder="Kampanye Instagram Oktober"
        />
      </div>

      <div className="brut-box-sm bg-acid p-3">
        <p className="font-mono text-[10px] uppercase tracking-widest">Hasil</p>
        <p className="mt-1 truncate font-mono text-sm font-bold">
          {baseUrl || "…"}/{form.slug.trim() || "acak"}
        </p>
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <button
          type="submit"
          disabled={busy || slugBlocked}
          className="brut-btn brut-btn-acid"
        >
          {busy ? "Menyimpan…" : "Pendekkan"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="brut-btn brut-btn-ghost">
            Batal
          </button>
        )}
      </div>
    </form>
  );
}
