import { useState } from "react";

export default function CopyButton({ value, label = "Salin" }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleCopy() {
    setFailed(false);
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setFailed(true);
    }
  }

  return (
    <button type="button" onClick={handleCopy} className="brut-btn brut-btn-ink !px-4 !py-2 !text-xs">
      {failed ? "Gagal menyalin" : copied ? "Tersalin!" : label}
    </button>
  );
}
