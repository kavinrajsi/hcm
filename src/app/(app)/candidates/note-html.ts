import sanitizeHtml from "sanitize-html";

// Candidate notes are rich text (bold, lists, links…) stored as HTML in the
// note's text. Notes written before this are plain text; running them through
// the same cleaner is safe, since plain text just comes out escaped.

const NOTE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "b", "strong", "i", "em", "u", "s", "strike", "code", "ul", "ol", "li", "blockquote", "a"],
  allowedAttributes: { a: ["href", "rel", "target"] },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
  },
};

/** Keeps only the formatting the note editor can write. */
export function cleanNoteHtml(html: string): string {
  return sanitizeHtml(html, NOTE_OPTIONS).trim();
}

/** The note's words with no formatting, for search, MadMax and MCP. */
export function plainNoteText(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, " ")
    .trim();
}
