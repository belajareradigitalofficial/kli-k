import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

const DEBOUNCE_MS = 400;

/**
 * Cek ketersediaan alias dengan debounce. Mengembalikan status:
 * "idle" | "checking" | "available" | "taken" | "invalid".
 */
export function useSlugCheck(slug, { excludeId, enabled = true } = {}) {
  const [state, setState] = useState({ status: "idle", message: "" });

  useEffect(() => {
    const value = (slug ?? "").trim();

    if (!enabled || value === "") {
      // Menyetel status ke idle saat input dikosongkan.
      // oxlint-disable-next-line react/set-state-in-effect
      setState({ status: "idle", message: "" });
      return undefined;
    }

    setState({ status: "checking", message: "Memeriksa…" });

    let cancelled = false;

    const timer = setTimeout(() => {
      api
        .checkSlug(value, excludeId)
        .then((data) => {
          if (cancelled) return;
          setState({
            status: data.available ? "available" : statusFromReason(data.reason),
            message: data.message,
          });
        })
        .catch(() => {
          if (!cancelled) setState({ status: "idle", message: "" });
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [slug, excludeId, enabled]);

  return state;
}

function statusFromReason(reason) {
  if (reason === "SLUG_TAKEN") return "taken";
  if (reason === "EMPTY_SLUG") return "idle";
  return "invalid";
}
