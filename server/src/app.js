import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import cors from "cors";
import { createLimiter } from "./lib/rate-limit.js";
import { prisma } from "./lib/prisma.js";
import { createAuthService } from "./services/auth.service.js";
import { createLinkService } from "./services/link.service.js";
import { createAuthRouter } from "./routes/auth.routes.js";
import { createLinksRouter } from "./routes/links.routes.js";
import { createRedirectRouter } from "./routes/redirect.routes.js";
import { createOriginCheck, createSessionLoader } from "./middleware/auth.js";
import { errorHandler, notFound } from "./middleware/error.js";
import {
  createFrontendMiddleware,
  hasFrontendBuild,
  resolveDistDir,
} from "./lib/frontend.js";

export function createApp({ db = prisma, serveFrontend, distDir } = {}) {
  const app = express();

  const authService = createAuthService(db);
  const linkService = createLinkService(db);

  const corsOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // trust proxy hanya kalau diminta eksplisit: nilai "1" adalah string di env,
  // Express butuh angka atau boolean agar tidak salah tafsir.
  if (process.env.TRUST_PROXY) {
    const raw = process.env.TRUST_PROXY;
    app.set("trust proxy", raw === "true" ? true : /^\d+$/.test(raw) ? Number(raw) : raw);
  }

  app.use(helmet());

  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
    }),
  );

  app.use(express.json({ limit: "32kb" }));

  if (process.env.NODE_ENV === "development") {
    app.use(morgan("dev"));
  }

  app.use(
    "/api",
    createLimiter({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      message: { error: "Terlalu banyak permintaan, coba lagi nanti" },
    }),
  );

  app.use(createOriginCheck(corsOrigins));
  app.use(createSessionLoader(authService));

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Dipakai frontend untuk menampilkan preview alamat pendek
  // (mis. "localhost:3000/" + alias) tanpa menebak dari response.
  app.get("/api/config", (req, res) => {
    res.json({ baseUrl: (process.env.BASE_URL || "").replace(/\/+$/, "") });
  });

  app.use("/api/auth", createAuthRouter(authService));
  app.use("/api/links", createLinksRouter(linkService));

  // Redirect publik. Slug yang tidak ditemukan diteruskan (next), sehingga
  // bisa jatuh ke penyaji frontend di bawah.
  app.use("/", createRedirectRouter(linkService, db));

  // Frontend (hasil build Vite). Dinyalakan kalau build tersedia, atau
  // dipaksa lewat opsi `serveFrontend` untuk pengujian.
  const resolvedDist = distDir ?? resolveDistDir();
  const frontendEnabled = serveFrontend ?? hasFrontendBuild(resolvedDist);

  if (frontendEnabled) {
    app.use(createFrontendMiddleware({ distDir: resolvedDist }));
  } else {
    console.warn(
      "[frontend] client/dist tidak ditemukan — hanya API yang dilayani. " +
        "Jalankan `npm run build` di client/ untuk menyajikan antarmuka.",
    );
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
