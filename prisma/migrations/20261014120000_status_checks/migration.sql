-- Status page: health checks every 5 minutes and scheduled-job runs. Additive only.

-- CreateTable
CREATE TABLE "HealthCheck" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "latencyMs" INTEGER,
    "detail" TEXT,

    CONSTRAINT "HealthCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CronRun" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN,
    "error" TEXT,

    CONSTRAINT "CronRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HealthCheck_service_checkedAt_idx" ON "HealthCheck"("service", "checkedAt");

-- CreateIndex
CREATE INDEX "HealthCheck_checkedAt_idx" ON "HealthCheck"("checkedAt");

-- CreateIndex
CREATE INDEX "CronRun_path_startedAt_idx" ON "CronRun"("path", "startedAt");

