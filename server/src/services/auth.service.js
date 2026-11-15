import { AppError } from "../lib/errors.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { createSessionToken, hashSessionToken, sessionTtlMs } from "../lib/session.js";

export function createAuthService(db) {
  async function register({ name, email, password }) {
    const passwordHash = await hashPassword(password);

    let user;
    try {
      user = await db.user.create({
        data: { name, email, passwordHash },
        select: { id: true, name: true, email: true, createdAt: true },
      });
    } catch (err) {
      if (err?.code === "P2002") {
        throw new AppError(409, "Email sudah terdaftar", "EMAIL_TAKEN");
      }
      throw err;
    }

    return user;
  }

  async function login({ email, password }) {
    const user = await db.user.findUnique({ where: { email } });

    // Pesan sengaja generik: jangan membocorkan apakah email terdaftar.
    // Tetap jalankan perbandingan hash walau user tidak ada supaya waktu
    // respons tidak membocorkan keberadaan akun.
    const hash = user?.passwordHash ?? DUMMY_HASH;
    const ok = await verifyPassword(password, hash);

    if (!user || !ok) {
      throw new AppError(401, "Email atau password salah", "INVALID_CREDENTIALS");
    }

    return user;
  }

  async function createSession(userId) {
    const token = createSessionToken();
    const expiresAt = new Date(Date.now() + sessionTtlMs());

    await db.session.create({
      data: { tokenHash: hashSessionToken(token), userId, expiresAt },
    });

    return { token, expiresAt };
  }

  async function resolveSession(token) {
    if (!token) return null;

    const session = await db.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    if (!session) return null;

    if (session.expiresAt.getTime() <= Date.now()) {
      await db.session.delete({ where: { id: session.id } }).catch(() => {});
      return null;
    }

    return { session, user: session.user };
  }

  async function destroySession(token) {
    if (!token) return;
    await db.session
      .deleteMany({ where: { tokenHash: hashSessionToken(token) } })
      .catch(() => {});
  }

  return { register, login, createSession, resolveSession, destroySession };
}

// Hash bcrypt valid dari password acak. Dipakai untuk menyamakan waktu
// respons saat email tidak ditemukan.
const DUMMY_HASH = "$2b$12$0iAOsn6ik6M9S2LcQKLGVOK8REi76aVt1W4o0TglxGs2gnFGrXZZW";
