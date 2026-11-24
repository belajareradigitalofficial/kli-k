-- Cache Open Graph halaman tujuan, dipakai saat crawler media sosial
-- meminta preview link (WhatsApp, Telegram, Facebook, …).
ALTER TABLE `Link`
  ADD COLUMN `ogTitle` VARCHAR(255) NULL,
  ADD COLUMN `ogDescription` TEXT NULL,
  ADD COLUMN `ogImage` TEXT NULL,
  ADD COLUMN `ogSiteName` VARCHAR(100) NULL,
  ADD COLUMN `ogFetchedAt` DATETIME(3) NULL;
