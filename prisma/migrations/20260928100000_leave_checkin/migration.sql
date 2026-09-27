-- Which Basecamp check-in a leave post came from ("leave" | "wfh").
ALTER TABLE "LeaveEntry" ADD COLUMN "checkin" TEXT NOT NULL DEFAULT 'leave';
