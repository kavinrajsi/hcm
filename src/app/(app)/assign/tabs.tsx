import { Segmented } from "@/components/segmented";

export const ASSIGN_TABS = [
  { key: "suggest", href: "/assign", label: "Who should take this?" },
  { key: "labels", href: "/assign/labels", label: "Label comments" },
  { key: "beliefs", href: "/assign/beliefs", label: "Beliefs" },
  { key: "eval", href: "/assign/eval", label: "How well it reads" },
] as const;

export type AssignTab = (typeof ASSIGN_TABS)[number]["key"];

/** Section switch shared by every /assign page. */
export function AssignTabs({ current }: { current: AssignTab }) {
  return (
    <Segmented
      label="Assign sections"
      items={ASSIGN_TABS.map((tab) => ({
        key: tab.key,
        href: tab.href,
        label: tab.label,
        active: tab.key === current,
      }))}
    />
  );
}
