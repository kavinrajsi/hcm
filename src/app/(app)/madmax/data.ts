import { requireUser } from "@/lib/rbac";
import { loadContext } from "@/lib/madmax/tools";
import { listThreads } from "@/lib/madmax/store";

/** Greeting by the IST hour, e.g. "Afternoon, Kavinraj". */
function greeting(name: string, now = new Date()): string {
  const hour = new Date(now.getTime() + 330 * 60_000).getUTCHours();
  const part = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
  return `${part}, ${name.split(/\s+/)[0]}`;
}

/** What both MadMax pages need: who's chatting and their past threads. */
export async function madmaxPageData() {
  const user = await requireUser();
  const [context, threads] = await Promise.all([
    loadContext(user),
    listThreads(user.id),
  ]);
  return {
    user,
    greeting: greeting(context.displayName),
    role: user.role,
    threads: threads.map((thread) => ({ id: thread.id, title: thread.title })),
  };
}
