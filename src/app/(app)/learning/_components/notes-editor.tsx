"use client";

import { useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading2, Italic, List, ListOrdered, Quote } from "lucide-react";
import { cn } from "@/lib/utils";

// Small rich-text editor for lesson notes and announcements. Links are
// made automatically from typed or pasted URLs. The HTML goes in a hidden
// input; the server sanitizes it.

export function NotesEditor({
  name,
  defaultValue = "",
  label,
  placeholder,
}: {
  name: string;
  defaultValue?: string;
  label: string;
  placeholder?: string;
}) {
  const [html, setHtml] = useState(defaultValue);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { autolink: true, linkOnPaste: true, openOnClick: false },
      }),
    ],
    content: defaultValue,
    editorProps: {
      attributes: {
        "aria-label": label,
        class:
          "min-h-28 px-3 py-2 text-sm outline-none [&_h2]:text-base [&_h2]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3",
        ...(placeholder ? { "data-placeholder": placeholder } : {}),
      },
    },
    onUpdate: ({ editor: current }) => setHtml(current.isEmpty ? "" : current.getHTML()),
  });
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current?.isActive("bold") ?? false,
      italic: current?.isActive("italic") ?? false,
      heading: current?.isActive("heading", { level: 2 }) ?? false,
      bullet: current?.isActive("bulletList") ?? false,
      ordered: current?.isActive("orderedList") ?? false,
      quote: current?.isActive("blockquote") ?? false,
    }),
  });

  const tools = [
    { key: "bold", label: "Bold", icon: Bold, run: () => editor?.chain().focus().toggleBold().run() },
    { key: "italic", label: "Italic", icon: Italic, run: () => editor?.chain().focus().toggleItalic().run() },
    { key: "heading", label: "Heading", icon: Heading2, run: () => editor?.chain().focus().toggleHeading({ level: 2 }).run() },
    { key: "bullet", label: "Bulleted list", icon: List, run: () => editor?.chain().focus().toggleBulletList().run() },
    { key: "ordered", label: "Numbered list", icon: ListOrdered, run: () => editor?.chain().focus().toggleOrderedList().run() },
    { key: "quote", label: "Quote", icon: Quote, run: () => editor?.chain().focus().toggleBlockquote().run() },
  ] as const;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <input type="hidden" name={name} value={html} />
      <div className="rounded-md border border-input dark:bg-input/30">
        <div role="toolbar" aria-label={`${label} formatting`} className="flex gap-0.5 border-b border-input p-1">
          {tools.map((tool) => (
            <button
              key={tool.key}
              type="button"
              aria-label={tool.label}
              aria-pressed={state?.[tool.key] ?? false}
              onClick={tool.run}
              className={cn(
                "flex size-8 items-center justify-center rounded text-zinc-500 hover:bg-muted hover:text-foreground",
                state?.[tool.key] && "bg-muted text-foreground",
              )}
            >
              <tool.icon className="size-4" />
            </button>
          ))}
        </div>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
