import { notFound } from "next/navigation";
import { DEFAULT_MODEL, MADMAX_MODELS } from "@/lib/madmax/models";
import { findOwnThread, loadMessages } from "@/lib/madmax/store";
import { MadmaxChat } from "../madmax-chat";
import { madmaxPageData } from "../data";

export const metadata = { title: "MadMax" };

export default async function MadmaxThreadPage({
  params,
}: PageProps<"/madmax/[threadId]">) {
  const { threadId } = await params;
  const { user, greeting, role, threads } = await madmaxPageData();
  const thread = await findOwnThread(threadId, user.id);
  if (!thread) notFound();
  const messages = await loadMessages(thread.id);
  const model =
    MADMAX_MODELS.find((option) => option.id === thread.model)?.key ??
    DEFAULT_MODEL;

  return (
    <MadmaxChat
      key={thread.id}
      threadId={thread.id}
      greeting={greeting}
      role={role}
      threads={threads}
      initialModel={model}
      initialMessages={messages}
    />
  );
}
