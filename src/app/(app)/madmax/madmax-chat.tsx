"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import {
  ArrowUp,
  Check,
  ChevronDown,
  Loader2,
  PanelLeft,
  Plus,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { AutoAwesomeIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { formatDay } from "@/lib/format-date";
import { MADMAX_MODELS, type MadmaxModelKey } from "@/lib/madmax/models";
import { deleteThread } from "./actions";

type Role = "HR_ADMIN" | "MANAGER" | "EMPLOYEE";

// History lives on the server; send only the newest message (plus the
// chosen model, when the user sent it — approvals reuse the thread's model).
const transport = new DefaultChatTransport({
  api: "/api/madmax",
  prepareSendMessagesRequest: ({ messages, id, body }) => ({
    body: { ...body, id, message: messages[messages.length - 1] },
  }),
});
type Thread = { id: string; title: string };

// Lookups shown as a quiet status row while they run.
const TOOL_LABELS: Record<string, string> = {
  getMyProfile: "your profile",
  listMyQuantumEntries: "your Quantum log",
  listMyLeave: "your leave",
  listMySessions: "your sessions",
  listMyReports: "your team",
  getEmployee: "the employee",
  listLeave: "leave posts",
  searchEmployees: "employees",
  searchCandidates: "candidates",
  getCandidate: "the candidate",
  listProbationDue: "probation due dates",
  listOnboarding: "onboarding",
};

// Everything MadMax can do, as prompts to start from. Clicking one fills the
// message box so names and dates can be edited first; [brackets] mark the
// bits to fill in. `change` prompts end in an Approve / Deny card.
type SamplePrompt = { text: string; change?: boolean };
type PromptGroup = { title: string; roles: Role[]; prompts: SamplePrompt[] };
const ALL: Role[] = ["EMPLOYEE", "MANAGER", "HR_ADMIN"];
const TEAM: Role[] = ["MANAGER", "HR_ADMIN"];
const HR: Role[] = ["HR_ADMIN"];

const PROMPT_GROUPS: PromptGroup[] = [
  {
    title: "Your data",
    roles: ALL,
    prompts: [
      { text: "Show my profile" },
      { text: "Show my leave this year" },
      { text: "How many leave days have I taken this year?" },
      { text: "What have I logged on Quantum this week?" },
      { text: "My upcoming sessions and the ones I attended" },
    ],
  },
  {
    title: "Update your data",
    roles: ALL,
    prompts: [
      { text: "Update my phone number to [number]", change: true },
      { text: "Change my address to [address], [city]", change: true },
      { text: "Log [2] hours on [brand] — [work] for today", change: true },
    ],
  },
  {
    title: "Your team",
    roles: TEAM,
    prompts: [
      { text: "Who reports to me?" },
      { text: "Show details for [employee ID or name]" },
      { text: "Pending leave in my team" },
      { text: "Leave taken by my team this month" },
      { text: "Approve the pending leave from [name]", change: true },
      { text: "Reject the leave from [name] on [date]", change: true },
    ],
  },
  {
    title: "Candidates",
    roles: HR,
    prompts: [
      { text: "Candidates in Interview" },
      { text: "Newest [Copywriter] applicants" },
      { text: "Show candidate [name] with notes" },
      { text: "Move [candidate name] to [Screening]", change: true },
      { text: "Add a note to [candidate name]: [note]", change: true },
    ],
  },
  {
    title: "Employees & probation",
    roles: HR,
    prompts: [
      { text: "Search employees in [department]" },
      { text: "List all interns" },
      { text: "Recent joiners" },
      { text: "Probation due in the next 30 days" },
      { text: "Confirm probation for [name]", change: true },
      { text: "Extend [name]'s probation to [DD/MM/YYYY]", change: true },
    ],
  },
  {
    title: "Leave",
    roles: HR,
    prompts: [
      { text: "Pending leave requests" },
      { text: "Leave posted between [DD/MM/YYYY] and [DD/MM/YYYY]" },
    ],
  },
];

/** A readable one-liner for an approval card. */
function describeChange(toolName: string, input: Record<string, unknown>) {
  const value = (key: string) => String(input[key] ?? "");
  switch (toolName) {
    case "updateMyContact":
      return `Update your contact details: ${Object.entries(input)
        .map(([key, field]) => `${key} → ${String(field)}`)
        .join(", ")}`;
    case "addMyQuantumEntry":
      return `Log ${value("durationMins")} min on ${value("brand")} — ${value("workName")}${
        input.date ? ` (${formatDay(value("date"))})` : " (today)"
      }`;
    case "reviewLeave":
      return `Mark leave post as ${value("decision").toLowerCase()}`;
    case "setCandidateStatus":
      return `Move candidate #${value("candidateId")} to ${value("status")}`;
    case "addCandidateNote":
      return `Add a note to candidate #${value("candidateId")}: “${value("text")}”`;
    case "confirmProbation":
      return "Confirm this probation (the employee becomes Permanent)";
    case "extendProbation":
      return `Extend probation to ${formatDay(value("extendedTo"))}${
        input.notes ? ` — ${value("notes")}` : ""
      }`;
    default:
      return `Run ${toolName}`;
  }
}

type ToolPart = {
  type: string;
  toolCallId: string;
  state: string;
  input?: Record<string, unknown>;
  errorText?: string;
  approval?: { id: string; approved?: boolean; isAutomatic?: boolean };
};

function ToolRow({
  part,
  onRespond,
}: {
  part: ToolPart;
  onRespond: (id: string, approved: boolean) => void;
}) {
  const name = part.type.slice("tool-".length);
  const lookup = TOOL_LABELS[name];

  if (part.state === "approval-requested" && !part.approval?.isAutomatic) {
    return (
      <div className="my-3 rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
        <p className="font-medium">MadMax AI wants to make a change</p>
        <p className="mt-1 text-zinc-700 dark:text-zinc-300">
          {describeChange(name, part.input ?? {})}
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => part.approval && onRespond(part.approval.id, true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-background hover:opacity-90"
          >
            <Check className="size-4" /> Approve
          </button>
          <button
            type="button"
            onClick={() => part.approval && onRespond(part.approval.id, false)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-300 px-3 hover:bg-muted dark:border-zinc-700"
          >
            <X className="size-4" /> Deny
          </button>
        </div>
      </div>
    );
  }

  const text =
    part.state === "output-denied" ||
    (part.state === "approval-responded" && part.approval?.approved === false)
      ? `Change denied — ${describeChange(name, part.input ?? {})}`
      : part.state === "output-error"
        ? `Couldn't ${lookup ? `look up ${lookup}` : "make that change"}: ${part.errorText ?? "error"}`
        : part.state === "output-available"
          ? lookup
            ? `Looked up ${lookup}`
            : `Done — ${describeChange(name, part.input ?? {})}`
          : lookup
            ? `Looking up ${lookup}…`
            : `Applying — ${describeChange(name, part.input ?? {})}`;
  const running =
    part.state === "input-streaming" ||
    part.state === "input-available" ||
    (part.state === "approval-responded" && part.approval?.approved);

  return (
    <p
      className={cn(
        "my-1.5 flex items-center gap-2 text-xs text-zinc-500",
        part.state === "output-error" && "text-red-600 dark:text-red-400",
      )}
    >
      {running ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <AutoAwesomeIcon className="size-3.5" />
      )}
      {text}
    </p>
  );
}

function Message({
  message,
  streaming,
  onRespond,
}: {
  message: UIMessage;
  streaming: boolean;
  onRespond: (id: string, approved: boolean) => void;
}) {
  if (message.role === "user") {
    const text = message.parts
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("");
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-muted px-4 py-2.5 text-sm">
          {text}
        </p>
      </div>
    );
  }
  return (
    <div className="text-sm leading-relaxed">
      {message.parts.map((part, index) => {
        if (part.type === "text") {
          return (
            <Streamdown key={index} isAnimating={streaming}>
              {part.text}
            </Streamdown>
          );
        }
        if (part.type.startsWith("tool-")) {
          return (
            <ToolRow
              key={index}
              part={part as unknown as ToolPart}
              onRespond={onRespond}
            />
          );
        }
        return null;
      })}
    </div>
  );
}

export function MadmaxChat({
  threadId,
  greeting,
  role,
  threads: initialThreads,
  initialModel,
  initialMessages,
}: {
  threadId?: string;
  greeting: string;
  role: Role;
  threads: Thread[];
  initialModel: MadmaxModelKey;
  initialMessages: UIMessage[];
}) {
  const router = useRouter();
  const [chatId] = useState(() => threadId ?? crypto.randomUUID());
  const [model, setModel] = useState<MadmaxModelKey>(initialModel);
  const [threads, setThreads] = useState(initialThreads);
  const [panelOpen, setPanelOpen] = useState(false);
  const [input, setInput] = useState("");
  const [, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    messages,
    sendMessage,
    status,
    stop,
    error,
    addToolApprovalResponse,
  } = useChat({
    id: chatId,
    messages: initialMessages,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  const busy = status === "submitted" || status === "streaming";

  // Keep the newest turn in view (scroll the log only, not the page).
  useEffect(() => {
    const log = scrollRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    if (messages.length === 0) {
      // First message: this chat now has a URL and a place in the history.
      window.history.replaceState(null, "", `/madmax/${chatId}`);
      setThreads((current) => [
        { id: chatId, title: trimmed.slice(0, 60) },
        ...current.filter((thread) => thread.id !== chatId),
      ]);
    }
    sendMessage({ text: trimmed }, { body: { model } });
    setInput("");
  }

  // Bumped when a sample prompt fills the box; the effect below then
  // focuses it and selects the first [placeholder] to type over.
  const [promptPicked, setPromptPicked] = useState(0);
  useEffect(() => {
    const box = inputRef.current;
    if (!promptPicked || !box) return;
    box.focus();
    const start = box.value.indexOf("[");
    const end = box.value.indexOf("]", start);
    if (start !== -1 && end !== -1) box.setSelectionRange(start, end + 1);
    else box.setSelectionRange(box.value.length, box.value.length);
  }, [promptPicked]);

  function fillPrompt(text: string) {
    setInput(text);
    setPromptPicked((count) => count + 1);
  }

  function respond(id: string, approved: boolean) {
    addToolApprovalResponse({ id, approved });
  }

  function removeThread(id: string) {
    setThreads((current) => current.filter((thread) => thread.id !== id));
    startTransition(async () => {
      await deleteThread(id);
      if (id === chatId) router.push("/madmax");
    });
  }

  const composer = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        send(input);
      }}
      className="rounded-2xl border border-zinc-200 bg-background shadow-sm focus-within:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:focus-within:border-zinc-700"
    >
      <label htmlFor="madmax-input" className="sr-only">
        Message MadMax AI
      </label>
      <textarea
        id="madmax-input"
        ref={inputRef}
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            send(input);
          }
        }}
        placeholder="How can I help you today?"
        rows={1}
        className="field-sizing-content max-h-60 min-h-14 w-full resize-none bg-transparent px-4 pt-4 text-base outline-none placeholder:text-zinc-400 md:text-sm"
      />
      <div className="flex items-center justify-end gap-2 px-3 pb-3">
        {busy ? (
          <button
            type="button"
            onClick={() => stop()}
            aria-label="Stop"
            className="flex size-8 items-center justify-center rounded-lg bg-foreground text-background"
          >
            <Square className="size-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="submit"
            aria-label="Send"
            disabled={!input.trim()}
            className="flex size-8 items-center justify-center rounded-lg bg-orange-600 text-white transition-opacity disabled:opacity-40"
          >
            <ArrowUp className="size-4" />
          </button>
        )}
      </div>
    </form>
  );

  const modelPicker = (
    <label className="relative inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-foreground">
      <span className="sr-only">Model</span>
      <select
        value={model}
        onChange={(event) => setModel(event.target.value as MadmaxModelKey)}
        className="cursor-pointer appearance-none bg-transparent pr-5 outline-none"
      >
        {MADMAX_MODELS.map((option) => (
          <option key={option.key} value={option.key}>
            {option.note ? `${option.label} (${option.note})` : option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-0 size-3.5" />
    </label>
  );

  const empty = messages.length === 0;

  return (
    <div className="relative flex h-[calc(100dvh-7rem-env(safe-area-inset-bottom))] min-w-0 flex-1 md:h-[calc(100dvh-4rem)]">
      {/* Chat history */}
      {panelOpen && (
        <button
          type="button"
          aria-label="Close chat history"
          onClick={() => setPanelOpen(false)}
          className="absolute inset-0 z-20 bg-black/20 md:hidden"
        />
      )}
      <aside
        className={cn(
          "absolute inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-zinc-200 bg-background transition-transform dark:border-zinc-800 md:static md:z-auto",
          panelOpen ? "translate-x-0" : "-translate-x-full md:hidden",
        )}
      >
        <div className="flex items-center justify-between p-3">
          <span className="text-sm font-medium">Chats</span>
          <Link
            href="/madmax"
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm hover:bg-muted"
          >
            <Plus className="size-4" /> New chat
          </Link>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {threads.length === 0 && (
            <li className="px-2 py-4 text-sm text-zinc-500">No chats yet.</li>
          )}
          {threads.map((thread) => (
            <li key={thread.id} className="group flex items-center">
              <Link
                href={`/madmax/${thread.id}`}
                className={cn(
                  "min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-sm hover:bg-muted",
                  thread.id === chatId && "bg-muted font-medium",
                )}
              >
                {thread.title}
              </Link>
              <button
                type="button"
                aria-label={`Delete “${thread.title}”`}
                onClick={() => removeThread(thread.id)}
                className="ml-1 rounded-md p-1.5 text-zinc-400 opacity-0 hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="relative flex min-w-0 flex-1 flex-col">
        <div className="absolute left-3 top-3 z-10">
          <button
            type="button"
            onClick={() => setPanelOpen((open) => !open)}
            aria-label={panelOpen ? "Hide chat history" : "Show chat history"}
            aria-expanded={panelOpen}
            className="flex size-9 items-center justify-center rounded-md text-zinc-500 hover:bg-muted hover:text-foreground"
          >
            <PanelLeft className="size-5" />
          </button>
        </div>

        {empty ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex min-h-full flex-col items-center justify-center px-4 py-16">
              <h1 className="flex items-center gap-3 text-center font-serif text-3xl tracking-tight md:text-4xl">
                <AutoAwesomeIcon className="size-8 shrink-0 text-orange-600 md:size-10" />
                {greeting}
              </h1>
              <div className="mt-8 w-full max-w-2xl">
                {composer}
                <div className="mt-2 flex justify-end px-1">{modelPicker}</div>

                <div className="mt-8">
                  <h2 className="px-1 text-sm font-medium text-zinc-500">
                    Try asking
                  </h2>
                  <div className="mt-3 grid gap-x-6 gap-y-5 sm:grid-cols-2">
                    {PROMPT_GROUPS.filter((group) =>
                      group.roles.includes(role),
                    ).map((group) => (
                      <section key={group.title}>
                        <h3 className="px-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
                          {group.title}
                        </h3>
                        <ul className="mt-1.5">
                          {group.prompts.map((prompt) => (
                            <li key={prompt.text}>
                              <button
                                type="button"
                                onClick={() => fillPrompt(prompt.text)}
                                className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1.5 text-left text-sm text-zinc-700 hover:bg-muted hover:text-foreground dark:text-zinc-300"
                              >
                                <span className="min-w-0">{prompt.text}</span>
                                {prompt.change && (
                                  <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                                    needs approval
                                  </span>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-6 pt-16">
                {messages.map((message, index) => (
                  <Message
                    key={message.id}
                    message={message}
                    streaming={
                      status === "streaming" && index === messages.length - 1
                    }
                    onRespond={respond}
                  />
                ))}
                {status === "submitted" && (
                  <p className="flex items-center gap-2 text-xs text-zinc-500">
                    <Loader2 className="size-3.5 animate-spin" /> Thinking…
                  </p>
                )}
                {error && (
                  <p role="alert" className="text-sm text-red-600">
                    {error.message || "Something went wrong. Try again."}
                  </p>
                )}
              </div>
            </div>
            <div className="mx-auto w-full max-w-3xl px-4 pb-4">
              {composer}
              <div className="mt-2 flex justify-end px-1">{modelPicker}</div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
