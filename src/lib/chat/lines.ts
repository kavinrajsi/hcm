// Chat page: turns Basecamp Campfire chats and lines into BasecampChat /
// BasecampChatLine rows. Line HTML is sanitized here, once, before it is
// stored; the page renders it again through the same sanitizer.

import sanitizeHtml from "sanitize-html";
import { mentionsAsText } from "./format";

/** A Campfire as `/chats.json` returns it (fields we use). */
export type BasecampChatRecording = {
  id: number;
  title: string;
  app_url: string;
  lines_url: string;
  bucket: { id: number; name: string };
};

export type BasecampChatAttachment = {
  title?: string;
  filename?: string;
  content_type?: string;
  byte_size?: number;
  url?: string;
  download_url?: string;
};

/** A Campfire line as `/chats/:id/lines.json` returns it (fields we use). */
export type BasecampChatLineRecording = {
  id: number;
  type?: string; // Chat::Lines::Text | RichText | Upload
  created_at: string;
  content?: string | null;
  creator?: { id: number; name: string } | null;
  attachments?: BasecampChatAttachment[];
};

/** A file shown as a chip under the message. */
export type ChatAttachment = { name: string; contentType: string | null; size: number | null; url: string | null };

/**
 * Keeps what a chat message needs: text formatting, links, lists, quotes and
 * Basecamp images. Drops scripts, styles, iframes, event handlers and
 * anything that isn't http(s)/mailto. Mentions (<bc-attachment>) keep their
 * text.
 */
export function sanitizeChatHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "div", "span", "strong", "b", "em", "i", "u", "s", "code", "pre",
      "ul", "ol", "li", "blockquote", "a", "figure", "figcaption", "img",
    ],
    allowedAttributes: { a: ["href", "target", "rel"], img: ["src", "alt", "width", "height"] },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["https"] },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
      // Basecamp uses h1 for big text; in a chat bubble it reads as bold.
      h1: "strong",
    },
    nonTextTags: ["style", "script", "textarea", "option", "noscript", "iframe"],
  }).trim();
}

/** Plain text for the chat list's last-message preview. */
export function previewText(html: string, attachments: ChatAttachment[] = []): string {
  const text = sanitizeHtml(mentionsAsText(html).replace(/<(br|\/p|\/div|\/li)\s*\/?>/gi, " "), {
    allowedTags: [],
    allowedAttributes: {},
    nonTextTags: ["style", "script", "iframe", "figcaption"],
  })
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (text) return text.length > 120 ? `${text.slice(0, 119)}…` : text;
  if (attachments.length) return attachments.length === 1 ? `📎 ${attachments[0].name}` : `📎 ${attachments.length} files`;
  return "";
}

export function toChatRow(chat: BasecampChatRecording) {
  return {
    basecampId: String(chat.id),
    projectId: String(chat.bucket.id),
    projectName: chat.bucket.name,
    title: chat.title,
    linesUrl: chat.lines_url,
    appUrl: chat.app_url,
    data: { id: chat.id, title: chat.title, project: { id: chat.bucket.id, name: chat.bucket.name } },
  };
}

export function toChatLineRow(chatBasecampId: string, line: BasecampChatLineRecording) {
  const attachments: ChatAttachment[] = (line.attachments ?? []).map((file) => ({
    name: file.title || file.filename || "File",
    contentType: file.content_type ?? null,
    size: file.byte_size ?? null,
    url: file.download_url ?? file.url ?? null,
  }));
  const contentHtml = sanitizeChatHtml(line.content ?? "");
  return {
    basecampId: String(line.id),
    chatBasecampId,
    creatorPersonId: line.creator ? String(line.creator.id) : null,
    creatorName: line.creator?.name ?? "Someone",
    contentHtml,
    attachments: attachments.length ? attachments : undefined,
    createdAt: new Date(line.created_at),
    data: { id: line.id, type: line.type ?? null, createdAt: line.created_at },
    preview: previewText(contentHtml, attachments),
  };
}

/** Plain text typed in HCM, as the HTML Basecamp stores (escaped, line breaks kept). */
export function plainTextToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `<div>${escaped.replace(/\r?\n/g, "<br>")}</div>`;
}
