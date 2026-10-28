"use client";

import { useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Redo,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo,
  Unlink,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Rich-text note editor for the candidate timeline. Writes HTML into a hidden
// input named `name`; the server cleans it again (note-html.ts). Ctrl/⌘+Enter
// submits the form.

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
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-40 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
        active && "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100",
      )}
    >
      {children}
    </button>
  );
}

const ICON = "size-4";

export function NoteEditor({ name, placeholder }: { name: string; placeholder: string }) {
  const [html, setHtml] = useState("");
  const [empty, setEmpty] = useState(true);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        link: {
          openOnClick: false,
          autolink: false,
          protocols: ["http", "https", "mailto"],
          HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
        },
      }),
    ],
    onUpdate: ({ editor: current }) => {
      setHtml(current.isEmpty ? "" : current.getHTML());
      setEmpty(current.isEmpty);
    },
    editorProps: {
      attributes: {
        "aria-label": "Note",
        class:
          "min-h-20 px-3 py-2 text-sm outline-none [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-300 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-zinc-100 [&_code]:px-1 dark:[&_code]:bg-zinc-800 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5",
      },
      handleKeyDown: (view, event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          view.dom.closest("form")?.requestSubmit();
          return true;
        }
        return false;
      },
    },
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current?.isActive("bold") ?? false,
      italic: current?.isActive("italic") ?? false,
      underline: current?.isActive("underline") ?? false,
      strike: current?.isActive("strike") ?? false,
      bulletList: current?.isActive("bulletList") ?? false,
      orderedList: current?.isActive("orderedList") ?? false,
      blockquote: current?.isActive("blockquote") ?? false,
      link: current?.isActive("link") ?? false,
      canUndo: current?.can().undo() ?? false,
      canRedo: current?.can().redo() ?? false,
    }),
  });

  const setLink = () => {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link address (https://…)", previous ?? "https://");
    if (url === null) return;
    if (url.trim() === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };

  return (
    <div className="rounded-md border border-zinc-300 dark:border-zinc-700">
      <input type="hidden" name={name} value={html} />
      <div className="flex flex-wrap items-center gap-0.5 border-b border-zinc-200 px-1.5 py-1 dark:border-zinc-800">
        <ToolButton label="Bold" active={state?.bold} onClick={() => editor?.chain().focus().toggleBold().run()}>
          <Bold className={ICON} />
        </ToolButton>
        <ToolButton label="Italic" active={state?.italic} onClick={() => editor?.chain().focus().toggleItalic().run()}>
          <Italic className={ICON} />
        </ToolButton>
        <ToolButton label="Underline" active={state?.underline} onClick={() => editor?.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className={ICON} />
        </ToolButton>
        <ToolButton label="Strikethrough" active={state?.strike} onClick={() => editor?.chain().focus().toggleStrike().run()}>
          <Strikethrough className={ICON} />
        </ToolButton>
        <span className="mx-1 h-5 w-px bg-zinc-200 dark:bg-zinc-800" aria-hidden />
        <ToolButton label="Bulleted list" active={state?.bulletList} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          <List className={ICON} />
        </ToolButton>
        <ToolButton label="Numbered list" active={state?.orderedList} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className={ICON} />
        </ToolButton>
        <ToolButton label="Quote" active={state?.blockquote} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
          <Quote className={ICON} />
        </ToolButton>
        <ToolButton label="Link" active={state?.link} onClick={setLink}>
          <LinkIcon className={ICON} />
        </ToolButton>
        {state?.link && (
          <ToolButton label="Remove link" onClick={() => editor?.chain().focus().unsetLink().run()}>
            <Unlink className={ICON} />
          </ToolButton>
        )}
        <span className="mx-1 h-5 w-px bg-zinc-200 dark:bg-zinc-800" aria-hidden />
        <ToolButton label="Undo" disabled={!state?.canUndo} onClick={() => editor?.chain().focus().undo().run()}>
          <Undo className={ICON} />
        </ToolButton>
        <ToolButton label="Redo" disabled={!state?.canRedo} onClick={() => editor?.chain().focus().redo().run()}>
          <Redo className={ICON} />
        </ToolButton>
      </div>
      <div className="relative">
        {empty && (
          <span className="pointer-events-none absolute top-2 left-3 text-sm text-zinc-500">
            {placeholder}
          </span>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
