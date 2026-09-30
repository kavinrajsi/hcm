-- Assignment Intelligence (docs/assignment-intelligence): completed
-- Basecamp to-dos as jobs with assignees and comment threads, coordinator
-- labels on comments, the floor manager's written-down beliefs, and a log
-- of suggestion queries with the pick actually made.

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "basecampTodoId" TEXT NOT NULL,
    "bucketId" TEXT NOT NULL,
    "bucketName" TEXT NOT NULL,
    "todolistTitle" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "creatorPersonId" TEXT NOT NULL,
    "creatorName" TEXT NOT NULL,
    "creatorEmail" TEXT,
    "createdAtBasecamp" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "completedBy" TEXT,
    "commentsCount" INTEGER NOT NULL DEFAULT 0,
    "basecampUpdatedAt" TIMESTAMP(3) NOT NULL,
    "kind" TEXT,
    "kindBy" TEXT,
    "evalSet" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobAssignee" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "title" TEXT,
    "employeeId" TEXT,

    CONSTRAINT "JobAssignee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobComment" (
    "id" TEXT NOT NULL,
    "basecampId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "authorPersonId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorEmail" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "content" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "aiLabels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aiLabelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentLabel" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommentLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignerBelief" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesignerBelief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentQuery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "coordinatorId" TEXT,
    "kind" TEXT NOT NULL,
    "kindBy" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "chosenPersonId" TEXT,
    "chosenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentQuery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Job_basecampTodoId_key" ON "Job"("basecampTodoId");

-- CreateIndex
CREATE INDEX "Job_kind_idx" ON "Job"("kind");

-- CreateIndex
CREATE INDEX "Job_creatorPersonId_idx" ON "Job"("creatorPersonId");

-- CreateIndex
CREATE INDEX "Job_completedAt_idx" ON "Job"("completedAt");

-- CreateIndex
CREATE INDEX "Job_evalSet_idx" ON "Job"("evalSet");

-- CreateIndex
CREATE INDEX "JobAssignee_personId_idx" ON "JobAssignee"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "JobAssignee_jobId_personId_key" ON "JobAssignee"("jobId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "JobComment_basecampId_key" ON "JobComment"("basecampId");

-- CreateIndex
CREATE INDEX "JobComment_jobId_postedAt_idx" ON "JobComment"("jobId", "postedAt");

-- CreateIndex
CREATE INDEX "JobComment_aiLabelledAt_idx" ON "JobComment"("aiLabelledAt");

-- CreateIndex
CREATE INDEX "CommentLabel_userId_idx" ON "CommentLabel"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommentLabel_commentId_userId_key" ON "CommentLabel"("commentId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "DesignerBelief_userId_personId_kind_key" ON "DesignerBelief"("userId", "personId", "kind");

-- CreateIndex
CREATE INDEX "AssignmentQuery_userId_createdAt_idx" ON "AssignmentQuery"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "JobAssignee" ADD CONSTRAINT "JobAssignee_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAssignee" ADD CONSTRAINT "JobAssignee_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobComment" ADD CONSTRAINT "JobComment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentLabel" ADD CONSTRAINT "CommentLabel_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "JobComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentLabel" ADD CONSTRAINT "CommentLabel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignerBelief" ADD CONSTRAINT "DesignerBelief_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentQuery" ADD CONSTRAINT "AssignmentQuery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

