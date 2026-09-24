-- CreateTable
CREATE TABLE "candidates" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "first_name" TEXT,
    "last_name" TEXT,
    "email" TEXT,
    "mobile_number" TEXT,
    "position" TEXT,
    "job_role" TEXT,
    "file_url" TEXT,
    "portfolio" TEXT,
    "status" TEXT DEFAULT 'New',
    "ip_address" TEXT,
    "location" TEXT,
    "source_url" TEXT,
    "notes" TEXT,
    "order_index" INTEGER DEFAULT 9999,
    "page_url" TEXT,
    "referrer" TEXT,
    "user_agent" TEXT,
    "honeypot" TEXT DEFAULT '',

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "candidates_created_at_idx" ON "candidates"("created_at" DESC);

