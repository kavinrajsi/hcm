import sanitizeHtml from "sanitize-html";

// Lesson notes and announcement bodies are rich text from the editor. Keep
// formatting and links; drop scripts, styles, event handlers and anything
// that isn't http(s)/mailto.

export function sanitizeNotes(html: string): string {
  const clean = sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "strong", "b", "em", "i", "u", "s", "mark", "code", "pre",
      "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "hr", "a",
      "table", "thead", "tbody", "tr", "th", "td",
    ],
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
    },
  }).trim();
  // An emptied editor leaves "<p></p>".
  return clean.replace(/<p>\s*<\/p>/g, "").trim();
}
