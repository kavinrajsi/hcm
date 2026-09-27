-- Disabled accounts cannot sign in (HR "Users & roles" page, or employee exit).
ALTER TABLE "User" ADD COLUMN "disabledAt" TIMESTAMP(3);
