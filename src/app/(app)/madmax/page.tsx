import { DEFAULT_MODEL } from "@/lib/madmax/models";
import { MadmaxChat } from "./madmax-chat";
import { madmaxPageData } from "./data";

export const metadata = { title: "MadMax AI" };

export default async function MadmaxPage() {
  const { greeting, role, threads } = await madmaxPageData();
  return (
    <MadmaxChat
      key="new"
      greeting={greeting}
      role={role}
      threads={threads}
      initialModel={DEFAULT_MODEL}
      initialMessages={[]}
    />
  );
}
