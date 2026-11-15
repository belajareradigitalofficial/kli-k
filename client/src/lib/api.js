const BASE = "/api";

export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(path, { method = "GET", body } = {}) {
  const options = {
    method,
    credentials: "include",
    headers: {},
  };

  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`${BASE}${path}`, options);
  } catch {
    throw new ApiError(0, "Tidak bisa menghubungi server", "NETWORK_ERROR");
  }

  if (res.status === 204) return null;

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error || `Permintaan gagal (${res.status})`,
      data?.code,
    );
  }

  return data;
}

export const api = {
  // konfigurasi
  config: () => request("/config"),

  // auth
  register: (payload) => request("/auth/register", { method: "POST", body: payload }),
  login: (payload) => request("/auth/login", { method: "POST", body: payload }),
  logout: () => request("/auth/logout", { method: "POST" }),
  me: () => request("/auth/me"),

  // links
  summary: () => request("/links/summary"),
  checkSlug: (slug, excludeId) => {
    const query = new URLSearchParams({ slug: slug ?? "" });
    if (excludeId) query.set("excludeId", excludeId);
    return request(`/links/check-slug?${query.toString()}`);
  },
  list: (params = {}) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        query.set(key, value);
      }
    }
    const suffix = query.toString();
    return request(`/links${suffix ? `?${suffix}` : ""}`);
  },
  get: (id) => request(`/links/${id}`),
  stats: (id) => request(`/links/${id}/stats`),
  create: (payload) => request("/links", { method: "POST", body: payload }),
  update: (id, payload) => request(`/links/${id}`, { method: "PATCH", body: payload }),
  remove: (id) => request(`/links/${id}`, { method: "DELETE" }),
};
