import { EmployeeAvatar } from "@/components/employee-avatar";
import { MoreHorizIcon } from "@/components/icons";

// Overlapping profile pictures for a group of people (a to-do's assignees):
// the first few, then a "…" bubble for the rest. Names show on hover and to
// screen readers.

export function AvatarStack({
  people,
  max = 4,
}: {
  people: { id: string; name: string; avatarKey: string | null }[];
  /** Photos shown before the "…" bubble. */
  max?: number;
}) {
  // A full row of `max` photos reads better than max - 1 plus a bubble for one.
  const shown = people.length > max ? people.slice(0, max - 1) : people;
  const hidden = people.slice(shown.length);
  return (
    <ul className="flex items-center -space-x-2">
      {shown.map((person) => (
        <li key={person.id} title={person.name} className="rounded-full ring-2 ring-background">
          <EmployeeAvatar name={person.name} avatarKey={person.avatarKey} />
          <span className="sr-only">{person.name}</span>
        </li>
      ))}
      {hidden.length > 0 && (
        <li
          title={hidden.map((person) => person.name).join(", ")}
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white ring-2 ring-background"
        >
          <MoreHorizIcon className="size-5" />
          <span className="sr-only">
            and {hidden.length} more: {hidden.map((person) => person.name).join(", ")}
          </span>
        </li>
      )}
    </ul>
  );
}
