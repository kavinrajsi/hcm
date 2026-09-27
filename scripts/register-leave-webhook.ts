// One-time (idempotent) setup: tells Basecamp to call HCM whenever someone
// answers the leave or WFH check-in, so leave posts show up within
// seconds. Re-run after rotating BASECAMP_WEBHOOK_SECRET.
//
//   BASECAMP_WEBHOOK_SECRET=… npx tsx scripts/register-leave-webhook.ts https://connect.madarth.com
//
// Uses the Basecamp connection the background jobs use. Prints no secrets.
import "dotenv/config";
import { db } from "@/lib/db";
import { ensureLeaveWebhook, getAccessToken } from "@/lib/basecamp";
import { leaveSyncUserId } from "@/lib/leave-sync";

async function main() {
  const origin = process.argv[2];
  const secret = process.env.BASECAMP_WEBHOOK_SECRET;
  if (!origin?.startsWith("https://"))
    throw new Error("Pass the https site URL");
  if (!secret) throw new Error("BASECAMP_WEBHOOK_SECRET is not set");

  const userId = await leaveSyncUserId();
  const auth = userId ? await getAccessToken(userId) : null;
  if (!auth) throw new Error("No HR admin has a working Basecamp connection");

  const url = `${origin}/api/basecamp/webhook?token=${encodeURIComponent(secret)}`;
  const { created, webhook } = await ensureLeaveWebhook(auth.accessToken, url);
  console.log(
    `${created ? "Registered" : "Already registered"}: webhook ${webhook.id} → ${origin}/api/basecamp/webhook (types: ${webhook.types.join(", ")}, active: ${webhook.active})`,
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
