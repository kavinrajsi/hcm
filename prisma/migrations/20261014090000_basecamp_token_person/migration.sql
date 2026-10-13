-- Basecamp connections remember whose Basecamp account they are (Chat: own messages on the right). Additive only.

-- AlterTable
ALTER TABLE "BasecampToken" ADD COLUMN     "personId" TEXT;

