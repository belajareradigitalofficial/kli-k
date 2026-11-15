import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

/**
 * Memuat BASE_URL backend sekali, dipakai untuk menampilkan preview
 * alamat pendek ("localhost:3000/" + alias).
 */
let cachedBaseUrl = null;

export function useBaseUrl() {
  const [baseUrl, setBaseUrl] = useState(cachedBaseUrl ?? "");

  useEffect(() => {
    if (cachedBaseUrl !== null) return;

    let alive = true;
    api
      .config()
      .then((data) => {
        cachedBaseUrl = data.baseUrl ?? "";
        if (alive) setBaseUrl(cachedBaseUrl);
      })
      .catch(() => {
        cachedBaseUrl = "";
      });

    return () => {
      alive = false;
    };
  }, []);

  return baseUrl;
}
