import QRCode from "qrcode";

// QR codes for device labels. Medium error correction survives a scuffed
// sticker; the quiet zone is kept small because the label adds its own.

const OPTIONS = { errorCorrectionLevel: "M" as const, margin: 1 };

export async function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { ...OPTIONS, type: "svg" });
}

export async function qrPng(url: string, width = 600): Promise<Buffer> {
  return QRCode.toBuffer(url, { ...OPTIONS, type: "png", width });
}
