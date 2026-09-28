-- HR-edited Letters templates (no row = built-in default).
CREATE TABLE "LetterTemplate" (
    "type" "LetterType" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "LetterTemplate_pkey" PRIMARY KEY ("type")
);

ALTER TABLE "LetterTemplate" ADD CONSTRAINT "LetterTemplate_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
