-- Email log: which service sent each email ("zeptomail" or "zoho-smtp"). Null on older rows means ZeptoMail. Additive only.

-- AlterTable
ALTER TABLE "EmailLog" ADD COLUMN     "provider" TEXT;
