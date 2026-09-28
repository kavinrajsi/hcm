import sanitizeHtml from "sanitize-html";

// Turns editor HTML into HTML email clients render reliably: a small tag
// allowlist, inline styles only (no classes, <style> or scripts), and
// explicit spacing/borders so Gmail, Outlook and Apple Mail agree. Used on
// the server before sending/saving and in the editor's Preview tab.

/** Placeholders fillTemplate replaces with employee data. */
export const EMAIL_PLACEHOLDERS = [
  "{{name}}",
  "{{empId}}",
  "{{designation}}",
  "{{department}}",
  "{{dateOfJoining}}",
] as const;

const TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "a",
  "span",
  "mark",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "blockquote",
  "hr",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
];

const COLOR = [
  /^#[0-9a-f]{3,8}$/i,
  /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/i,
];

// Pass 1: strict allowlist. Styles limited to colour and alignment.
const STRICT: sanitizeHtml.IOptions = {
  allowedTags: TAGS,
  allowedAttributes: {
    "*": ["style"],
    a: ["href", "style"],
    td: ["colspan", "rowspan", "style"],
    th: ["colspan", "rowspan", "style"],
  },
  allowedStyles: {
    "*": {
      color: COLOR,
      "background-color": COLOR,
      "text-align": [/^(left|right|center|justify)$/],
    },
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href"],
  allowProtocolRelative: false,
};

const LINK = "color:#2563eb;text-decoration:underline";
const CELL = "border:1px solid #e4e4e7;padding:6px 10px;vertical-align:top";

// Email defaults per tag; the editor's own styles (colour, alignment) win.
const DEFAULTS: Record<string, string> = {
  p: "margin:0 0 12px",
  h2: "margin:16px 0 8px;font-size:20px;line-height:28px;font-weight:700",
  h3: "margin:14px 0 6px;font-size:17px;line-height:24px;font-weight:700",
  ul: "margin:0 0 12px;padding-left:20px",
  ol: "margin:0 0 12px;padding-left:20px",
  li: "margin:0 0 4px",
  blockquote:
    "margin:0 0 12px;padding:4px 0 4px 12px;border-left:3px solid #d4d4d8;color:#52525b",
  hr: "border:0;border-top:1px solid #e4e4e7;margin:16px 0",
  a: LINK,
  table: "border-collapse:collapse;width:100%;margin:0 0 12px",
  th: `${CELL};background-color:#f4f4f5;font-weight:600;text-align:left`,
  td: CELL,
};

/** "a:1;b:2" + "b:3" → "a:1;b:3": one entry per property, later wins. */
function mergeStyles(...styles: (string | undefined)[]): string {
  const props = new Map<string, string>();
  for (const style of styles) {
    for (const declaration of (style ?? "").split(";")) {
      const colon = declaration.indexOf(":");
      if (colon === -1) continue;
      const property = declaration.slice(0, colon).trim().toLowerCase();
      const value = declaration.slice(colon + 1).trim();
      if (property && value) props.set(property, value);
    }
  }
  return [...props]
    .map(([property, value]) => `${property}:${value}`)
    .join(";");
}

function withDefaults(
  tagName: string,
  attribs: sanitizeHtml.Attributes,
): sanitizeHtml.Attributes {
  const base = DEFAULTS[tagName];
  if (!base) return attribs;
  return { ...attribs, style: mergeStyles(base, attribs.style) };
}

// Pass 2: runs on pass-1 output only, so it may add styles freely.
const INLINE: sanitizeHtml.IOptions = {
  allowedTags: TAGS,
  allowedAttributes: {
    "*": ["style"],
    a: ["href", "style", "target", "rel"],
    table: ["style", "role", "cellpadding", "cellspacing", "width"],
    td: ["colspan", "rowspan", "style"],
    th: ["colspan", "rowspan", "style"],
  },
  allowedStyles: undefined,
  parseStyleAttributes: false,
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    mark: (_tag, attribs) => ({
      tagName: "span",
      attribs: {
        style: mergeStyles("background-color:#fef08a", attribs.style),
      },
    }),
    table: (tag, attribs) => ({
      tagName: tag,
      attribs: {
        ...withDefaults(tag, attribs),
        role: "presentation",
        cellpadding: "0",
        cellspacing: "0",
        width: "100%",
      },
    }),
    a: (tag, attribs) => ({
      tagName: tag,
      attribs: {
        ...withDefaults(tag, attribs),
        target: "_blank",
        rel: "noopener noreferrer",
      },
    }),
    ...Object.fromEntries(
      Object.keys(DEFAULTS)
        .filter((tag) => tag !== "a" && tag !== "table")
        .map((tag) => [
          tag,
          (tagName: string, attribs: sanitizeHtml.Attributes) => ({
            tagName,
            attribs: withDefaults(tagName, attribs),
          }),
        ]),
    ),
  },
};

/** Table cells and list items: paragraphs become line breaks. */
function flattenCells(html: string): string {
  return html.replace(
    /<(td|th|li)\b([^>]*)>([\s\S]*?)<\/\1>/gi,
    (_match, tag: string, attrs: string, inner: string) => {
      const text = inner
        .replace(/<p\b[^>]*>/gi, "")
        .replace(/<\/p>/gi, "<br>")
        .replace(/(<br\s*\/?>\s*)+$/i, "");
      // Empty cells collapse in email clients; keep the row height.
      const filled = tag !== "li" && text.trim() === "" ? "&nbsp;" : text;
      return `<${tag}${attrs}>${filled}</${tag}>`;
    },
  );
}

export function toEmailHtml(html: string): string {
  const safe = sanitizeHtml(html, STRICT);
  return sanitizeHtml(flattenCells(safe), INLINE).trim();
}

/** True when the HTML has no visible text (e.g. an empty editor). */
export function isBlankHtml(html: string): boolean {
  return (
    sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
      .replace(/&nbsp;/g, " ")
      .trim() === ""
  );
}
