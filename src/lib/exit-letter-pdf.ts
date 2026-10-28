import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

// Builds an exit letter as an A4 PDF. Standard PDF fonts only cover Latin
// text, so anything outside that range becomes "?" rather than failing the
// whole letter; names in other scripts need a font file later.

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 72;
const BODY_SIZE = 11;
const LINE_HEIGHT = 16;

export type ExitLetterPdfInput = {
  title: string;
  issuedOn: string;
  paragraphs: string[];
  signatory: { name: string; designation: string };
};

export function toPdfText(text: string): string {
  return text.replace(/[^\x20-\x7E\xA0-\xFF–—‘’“”•]/g, "?");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function buildExitLetterPdf(input: ExitLetterPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const maxWidth = PAGE_WIDTH - MARGIN * 2;

  let page: PDFPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const ensureSpace = (height: number) => {
    if (y - height < MARGIN) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  };

  const writeLines = (text: string, font: PDFFont, size: number, gapAfter: number) => {
    for (const line of wrap(toPdfText(text), font, size, maxWidth)) {
      ensureSpace(LINE_HEIGHT);
      page.drawText(line, { x: MARGIN, y, size, font });
      y -= LINE_HEIGHT;
    }
    y -= gapAfter;
  };

  writeLines("MADARTH", bold, 16, 4);
  writeLines("Human Resources", regular, BODY_SIZE, 28);
  writeLines(`Date: ${input.issuedOn}`, regular, BODY_SIZE, 18);
  writeLines(input.title, bold, 13, 16);
  for (const paragraph of input.paragraphs) writeLines(paragraph, regular, BODY_SIZE, 10);

  ensureSpace(LINE_HEIGHT * 5);
  y -= 16;
  writeLines("Yours sincerely,", regular, BODY_SIZE, 36);
  writeLines(input.signatory.name, bold, BODY_SIZE, 0);
  writeLines(input.signatory.designation, regular, BODY_SIZE, 0);

  return doc.save();
}
