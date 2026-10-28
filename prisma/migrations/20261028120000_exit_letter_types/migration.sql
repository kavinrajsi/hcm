-- Exit letters: relieving, experience and internship certificate, plus the
-- private PDF blob key on each letter. Additive only.

-- AlterEnum
ALTER TYPE "LetterType" ADD VALUE 'RELIEVING';
ALTER TYPE "LetterType" ADD VALUE 'EXPERIENCE';
ALTER TYPE "LetterType" ADD VALUE 'INTERNSHIP_CERTIFICATE';

-- AlterTable
ALTER TABLE "Letter" ADD COLUMN "pdfBlobKey" TEXT;
