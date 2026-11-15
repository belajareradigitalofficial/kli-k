import { Router } from "express";
import { createLimiter } from "../lib/rate-limit.js";
import { requireAuth } from "../middleware/auth.js";
import { validateLogin, validateRegister } from "../lib/validation.js";
import { clearSessionCookie, setSessionCookie } from "../lib/session.js";

export function createAuthRouter(authService) {
  const router = Router();

  // Login & register dibatasi lebih ketat untuk memperlambat percobaan
  // brute force dan pembuatan akun massal.
  const authLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    message: { error: "Terlalu banyak percobaan, coba lagi nanti" },
  });

  router.post("/register", authLimiter, async (req, res) => {
    const input = validateRegister(req.body);
    const user = await authService.register(input);

    const { token, expiresAt } = await authService.createSession(user.id);
    setSessionCookie(res, token, expiresAt);

    res.status(201).json({ user: serializeUser(user) });
  });

  router.post("/login", authLimiter, async (req, res) => {
    const input = validateLogin(req.body);
    const user = await authService.login(input);

    const { token, expiresAt } = await authService.createSession(user.id);
    setSessionCookie(res, token, expiresAt);

    res.json({ user: serializeUser(user) });
  });

  router.post("/logout", async (req, res) => {
    await authService.destroySession(req.sessionToken);
    clearSessionCookie(res);
    res.status(204).end();
  });

  router.get("/me", requireAuth, (req, res) => {
    res.json({ user: serializeUser(req.user) });
  });

  return router;
}

function serializeUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}
