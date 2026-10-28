-- Freelancer profile link (portfolio, Behance, Dribbble...). Nullable, so
-- existing rows stay as they are. Additive only.

-- AlterTable
ALTER TABLE "Freelancer" ADD COLUMN "profileUrl" TEXT;
