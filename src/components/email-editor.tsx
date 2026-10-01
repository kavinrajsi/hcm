"use client";

import { useClearFieldError } from "@/components/form/validated-form";
import { useState } from "react";
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyleKit } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import { TableKit } from "@tiptap/extension-table";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Redo,
  Strikethrough,
  Table as TableIcon,
  Underline as UnderlineIcon,
  Undo,
  Unlink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EMAIL_PLACEHOLDERS, toEmailHtml } from "@/lib/email-html";
import { letterEmailHtml } from "@/lib/letter-email-html";

// Rich-text editor for emails. Writes email-safe HTML into a hidden input
// (`name`), so plain server actions receive it; the server sanitises again.

const COLORS = [
  "#18181b",
  "#dc2626",
  "#ea580c",
  "#16a34a",
  "#2563eb",
  "#7c3aed",
];
const HIGHLIGHTS = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fbcfe8"];

type Tab = "write" | "preview" | "html";

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()} // keep the selection
      onClick={onClick}
      className={cn(
        "flex size-8 items-center justify-center rounded-md text-zinc-600 hover:bg-muted hover:text-foreground disabled:opacity-40 dark:text-zinc-300",
        active && "bg-muted text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-zinc-200 dark:bg-zinc-800" />;
}

function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      underline: current.isActive("underline"),
      strike: current.isActive("strike"),
      h2: current.isActive("heading", { level: 2 }),
      h3: current.isActive("heading", { level: 3 }),
      bullet: current.isActive("bulletList"),
      ordered: current.isActive("orderedList"),
      quote: current.isActive("blockquote"),
      link: current.isActive("link"),
      table: current.isActive("table"),
      left: current.isActive({ textAlign: "left" }),
      center: current.isActive({ textAlign: "center" }),
      right: current.isActive({ textAlign: "right" }),
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();

  function setLink() {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt(
      "Link address (https://…)",
      previous ?? "https://",
    );
    if (url === null) return;
    if (url.trim() === "") chain().extendMarkRange("link").unsetLink().run();
    else chain().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-zinc-200 p-1.5 dark:border-zinc-800">
      <ToolButton
        label="Bold"
        active={state.bold}
        onClick={() => chain().toggleBold().run()}
      >
        <Bold className="size-4" />
      </ToolButton>
      <ToolButton
        label="Italic"
        active={state.italic}
        onClick={() => chain().toggleItalic().run()}
      >
        <Italic className="size-4" />
      </ToolButton>
      <ToolButton
        label="Underline"
        active={state.underline}
        onClick={() => chain().toggleUnderline().run()}
      >
        <UnderlineIcon className="size-4" />
      </ToolButton>
      <ToolButton
        label="Strikethrough"
        active={state.strike}
        onClick={() => chain().toggleStrike().run()}
      >
        <Strikethrough className="size-4" />
      </ToolButton>
      <Divider />
      <ToolButton
        label="Heading"
        active={state.h2}
        onClick={() => chain().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="size-4" />
      </ToolButton>
      <ToolButton
        label="Subheading"
        active={state.h3}
        onClick={() => chain().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 className="size-4" />
      </ToolButton>
      <ToolButton
        label="Paragraph"
        onClick={() => chain().setParagraph().run()}
      >
        <Pilcrow className="size-4" />
      </ToolButton>
      <Divider />
      <ToolButton
        label="Bulleted list"
        active={state.bullet}
        onClick={() => chain().toggleBulletList().run()}
      >
        <List className="size-4" />
      </ToolButton>
      <ToolButton
        label="Numbered list"
        active={state.ordered}
        onClick={() => chain().toggleOrderedList().run()}
      >
        <ListOrdered className="size-4" />
      </ToolButton>
      <ToolButton
        label="Quote"
        active={state.quote}
        onClick={() => chain().toggleBlockquote().run()}
      >
        <Quote className="size-4" />
      </ToolButton>
      <ToolButton
        label="Divider line"
        onClick={() => chain().setHorizontalRule().run()}
      >
        <Minus className="size-4" />
      </ToolButton>
      <Divider />
      <ToolButton
        label="Align left"
        active={state.left}
        onClick={() => chain().setTextAlign("left").run()}
      >
        <AlignLeft className="size-4" />
      </ToolButton>
      <ToolButton
        label="Align centre"
        active={state.center}
        onClick={() => chain().setTextAlign("center").run()}
      >
        <AlignCenter className="size-4" />
      </ToolButton>
      <ToolButton
        label="Align right"
        active={state.right}
        onClick={() => chain().setTextAlign("right").run()}
      >
        <AlignRight className="size-4" />
      </ToolButton>
      <Divider />
      <span
        className="flex items-center gap-1 px-1"
        role="group"
        aria-label="Text colour"
      >
        {COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Text colour ${color}`}
            title="Text colour"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() =>
              color === COLORS[0]
                ? chain().unsetColor().run()
                : chain().setColor(color).run()
            }
            className="size-4 rounded-full ring-1 ring-zinc-300 dark:ring-zinc-700"
            style={{ backgroundColor: color }}
          />
        ))}
      </span>
      <span
        className="flex items-center gap-1 px-1"
        role="group"
        aria-label="Highlight"
      >
        <Highlighter className="size-4 text-zinc-500" aria-hidden="true" />
        {HIGHLIGHTS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Highlight ${color}`}
            title="Highlight"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => chain().toggleHighlight({ color }).run()}
            className="size-4 rounded ring-1 ring-zinc-300 dark:ring-zinc-700"
            style={{ backgroundColor: color }}
          />
        ))}
      </span>
      <Divider />
      <ToolButton label="Add link" active={state.link} onClick={setLink}>
        <LinkIcon className="size-4" />
      </ToolButton>
      <ToolButton
        label="Remove link"
        disabled={!state.link}
        onClick={() => chain().unsetLink().run()}
      >
        <Unlink className="size-4" />
      </ToolButton>
      <Divider />
      <ToolButton
        label="Insert table"
        onClick={() =>
          chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
      >
        <TableIcon className="size-4" />
      </ToolButton>
      {state.table && (
        <span className="flex flex-wrap items-center gap-1 text-xs">
          {(
            [
              ["+ Row", () => chain().addRowAfter().run()],
              ["− Row", () => chain().deleteRow().run()],
              ["+ Col", () => chain().addColumnAfter().run()],
              ["− Col", () => chain().deleteColumn().run()],
              ["Delete table", () => chain().deleteTable().run()],
            ] as const
          ).map(([label, run]) => (
            <button
              key={label}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={run}
              className="rounded border border-zinc-200 px-1.5 py-0.5 hover:bg-muted dark:border-zinc-800"
            >
              {label}
            </button>
          ))}
        </span>
      )}
      <Divider />
      <ToolButton
        label="Undo"
        disabled={!state.canUndo}
        onClick={() => chain().undo().run()}
      >
        <Undo className="size-4" />
      </ToolButton>
      <ToolButton
        label="Redo"
        disabled={!state.canRedo}
        onClick={() => chain().redo().run()}
      >
        <Redo className="size-4" />
      </ToolButton>
    </div>
  );
}

export function EmailEditor({
  name,
  defaultValue,
  subject,
  placeholders = false,
  label,
}: {
  /** Form field that receives the email-safe HTML. */
  name: string;
  defaultValue: string;
  /** Shown as the heading in the Preview tab. */
  subject: string;
  /** Show {{placeholder}} chips (template editing). */
  placeholders?: boolean;
  label: string;
}) {
  const clearError = useClearFieldError();
  const [tab, setTab] = useState<Tab>("write");
  const [html, setHtml] = useState(() => toEmailHtml(defaultValue));
  const [source, setSource] = useState(html);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        code: false,
        link: {
          openOnClick: false,
          protocols: ["mailto"],
          HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
        },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyleKit.configure({
        backgroundColor: false,
        fontFamily: false,
        fontSize: false,
        lineHeight: false,
      }),
      Highlight.configure({ multicolor: true }),
      TableKit.configure({ table: { resizable: false } }),
    ],
    content: html,
    editorProps: {
      attributes: {
        "aria-label": label,
        class: "email-editor min-h-60 px-4 py-3 text-sm leading-6 outline-none",
      },
    },
    onUpdate: ({ editor: current }) => {
      setHtml(toEmailHtml(current.getHTML()));
      clearError(name);
    },
  });

  function switchTab(next: Tab) {
    if (tab === "html" && next !== "html" && editor) {
      // Source edits flow back through the same sanitiser.
      const clean = toEmailHtml(source);
      editor.commands.setContent(clean, { emitUpdate: false });
      setHtml(clean);
    }
    if (next === "html") setSource(html);
    setTab(next);
  }

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800">
      <input type="hidden" name={name} value={html} />
      <div
        role="tablist"
        aria-label={`${label} view`}
        className="flex gap-1 border-b border-zinc-200 px-2 pt-2 dark:border-zinc-800"
      >
        {(
          [
            ["write", "Write"],
            ["preview", "Preview email"],
            ["html", "HTML"],
          ] as const
        ).map(([key, text]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => switchTab(key)}
            className={cn(
              "rounded-t-md px-3 py-1.5 text-sm text-zinc-500 hover:text-foreground",
              tab === key &&
                "border border-b-0 border-zinc-200 bg-background font-medium text-foreground dark:border-zinc-800",
            )}
          >
            {text}
          </button>
        ))}
      </div>

      {tab === "write" && (
        <>
          {editor && <Toolbar editor={editor} />}
          {placeholders && editor && (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-200 px-3 py-2 text-xs dark:border-zinc-800">
              <span className="text-zinc-500">Insert:</span>
              {EMAIL_PLACEHOLDERS.map((placeholder) => (
                <button
                  key={placeholder}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() =>
                    editor.chain().focus().insertContent(placeholder).run()
                  }
                  className="rounded border border-zinc-200 px-1.5 py-0.5 font-mono hover:bg-muted dark:border-zinc-800"
                >
                  {placeholder}
                </button>
              ))}
            </div>
          )}
          <EditorContent editor={editor} />
        </>
      )}

      {tab === "preview" && (
        <iframe
          title={`${label} preview`}
          sandbox=""
          srcDoc={letterEmailHtml(subject || "(no subject)", html)}
          className="h-[32rem] w-full rounded-b-lg bg-white"
        />
      )}

      {tab === "html" && (
        <textarea
          aria-label={`${label} HTML`}
          value={source}
          onChange={(event) => {
            setSource(event.target.value);
            clearError(name);
          }}
          spellCheck={false}
          className="block min-h-60 w-full resize-y bg-transparent px-4 py-3 font-mono text-xs outline-none"
        />
      )}
    </div>
  );
}
