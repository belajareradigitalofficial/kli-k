import { AppError } from "./errors.js";

// ---------------------------------------------------------------- akun

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX = 100;
const EMAIL_MAX = 191;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;

export function validateRegister(body) {
  assertObject(body);

  return {
    name: validateName(body.name),
    email: validateEmail(body.email),
    password: validatePassword(body.password),
  };
}

export function validateLogin(body) {
  assertObject(body);

  const password = typeof body.password === "string" ? body.password : "";
  if (password === "") {
    throw new AppError(400, "password wajib diisi", "INVALID_FIELD");
  }

  return { email: validateEmail(body.email), password };
}

function validateName(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new AppError(400, "nama wajib diisi", "INVALID_NAME");
  }
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length > NAME_MAX) {
    throw new AppError(400, `nama maksimal ${NAME_MAX} karakter`, "INVALID_NAME");
  }
  return name;
}

function validateEmail(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new AppError(400, "email wajib diisi", "INVALID_EMAIL");
  }
  const email = value.trim().toLowerCase();
  if (email.length > EMAIL_MAX || !EMAIL_PATTERN.test(email)) {
    throw new AppError(400, "format email tidak valid", "INVALID_EMAIL");
  }
  return email;
}

function validatePassword(value) {
  if (typeof value !== "string" || value === "") {
    throw new AppError(400, "password wajib diisi", "INVALID_PASSWORD");
  }
  if (value.length < PASSWORD_MIN) {
    throw new AppError(400, `password minimal ${PASSWORD_MIN} karakter`, "INVALID_PASSWORD");
  }
  if (Buffer.byteLength(value, "utf8") > PASSWORD_MAX) {
    throw new AppError(400, `password maksimal ${PASSWORD_MAX} byte`, "INVALID_PASSWORD");
  }
  return value;
}

// ---------------------------------------------------------------- link

const MAX_TITLE = 255;
const MAX_DESCRIPTION = 2000;

export function validateCreateLink(body) {
  assertObject(body);

  return {
    targetUrl: validateRequiredString(body.targetUrl, "targetUrl"),
    title: validateOptionalString(body.title, "title", MAX_TITLE),
    description: validateOptionalString(body.description, "description", MAX_DESCRIPTION),
    slug: body.slug,
    expiresAt: validateExpiresAt(body.expiresAt),
    isActive: validateBoolean(body.isActive, "isActive", true),
  };
}

export function validateUpdateLink(body) {
  assertObject(body);

  const data = {};

  if ("targetUrl" in body) {
    data.targetUrl = validateRequiredString(body.targetUrl, "targetUrl");
  }
  if ("title" in body) {
    data.title = validateOptionalString(body.title, "title", MAX_TITLE);
  }
  if ("description" in body) {
    data.description = validateOptionalString(body.description, "description", MAX_DESCRIPTION);
  }
  if ("expiresAt" in body) {
    data.expiresAt = validateExpiresAt(body.expiresAt);
  }
  if ("isActive" in body) {
    data.isActive = validateBoolean(body.isActive, "isActive", true);
  }
  // Alias boleh diubah, tapi slug kosong tidak masuk akal: link harus
  // selalu punya alamat. Nilai dinormalisasi di service.
  if ("slug" in body) {
    data.slug = body.slug;
  }

  if (Object.keys(data).length === 0) {
    throw new AppError(400, "tidak ada field yang bisa diperbarui", "EMPTY_UPDATE");
  }

  return data;
}

export function validatePagination(query) {
  const page = toPositiveInt(query.page, 1, "page");
  const limit = toPositiveInt(query.limit, 20, "limit");

  if (limit > 100) {
    throw new AppError(400, "limit maksimal 100", "INVALID_PAGINATION");
  }

  const search =
    typeof query.search === "string" && query.search.trim() !== ""
      ? query.search.trim().slice(0, 100)
      : null;

  return { page, limit, skip: (page - 1) * limit, search };
}

function assertObject(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AppError(400, "body harus berupa objek JSON", "INVALID_BODY");
  }
}

function validateRequiredString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new AppError(400, `${field} wajib diisi`, "INVALID_FIELD");
  }
  return value.trim();
}

function validateOptionalString(value, field, maxLength) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new AppError(400, `${field} harus berupa teks`, "INVALID_FIELD");
  }
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (trimmed.length > maxLength) {
    throw new AppError(400, `${field} maksimal ${maxLength} karakter`, "INVALID_FIELD");
  }
  return trimmed;
}

function validateBoolean(value, field, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") {
    throw new AppError(400, `${field} harus boolean`, "INVALID_FIELD");
  }
  return value;
}

function validateExpiresAt(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new AppError(400, "expiresAt harus string tanggal ISO", "INVALID_FIELD");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(400, "expiresAt bukan tanggal yang valid", "INVALID_FIELD");
  }
  return date;
}

function toPositiveInt(value, fallback, field) {
  if (value === undefined || value === null || value === "") return fallback;
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1) {
    throw new AppError(400, `${field} harus bilangan bulat positif`, "INVALID_PAGINATION");
  }
  return num;
}
