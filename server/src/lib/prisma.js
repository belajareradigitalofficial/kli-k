import { PrismaClient } from "@prisma/client";

// Singleton: di dev, --watch me-restart proses dan bisa membuat koneksi baru
// tanpa ini. Simpan di globalThis agar tidak menumpuk koneksi.
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__prisma = prisma;
}
