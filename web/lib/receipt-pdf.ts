import crypto from "node:crypto";

export interface PdfReceiptInput {
  reference: string;
  schoolName: string;
  email: string;
  planName: string;
  currency: string;
  originalAmountMinor: number;
  discountAmountMinor: number;
  amountMinor: number;
  feeMinor: number;
  customerPaidMinor: number;
  promoCode: string | null;
  channel: string;
  isTest: boolean;
  paidAt: string | null;
  licenseKey: string | null;
  expiresAt: string | null;
  durationLabel?: string;
}

/**
 * Escapes characters for standard PDF literal strings (WinAnsi / ASCII safe).
 * Converts currency symbols like ₦ to "NGN " for guaranteed crisp rendering in built-in PDF Type1 fonts.
 */
function pdfStr(input: string): string {
  const ascii = String(input || "")
    .replace(/₦/g, "NGN ")
    .replace(/—/g, "-")
    .replace(/–/g, "-")
    .replace(/·/g, " | ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return ascii.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function fmtCurrencyAscii(minor: number, currency: string): string {
  const cur = String(currency || "NGN").trim().toUpperCase();
  const prefix = cur === "USD" ? "$" : `${cur} `;
  const val = (Number(minor || 0) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${prefix}${val}`;
}

function fmtDateUtc(iso: string | null | undefined): string {
  if (!iso) return "N/A";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function truncate(text: string, maxLen: number): string {
  const clean = String(text || "").trim();
  return clean.length > maxLen ? `${clean.slice(0, maxLen - 3)}...` : clean;
}

/**
 * Pure zero-dependency PDF 1.4 generator producing a crisp, print-ready monochrome
 * CogniTara Official Payment Receipt & Licence Certificate PDF (A4: 595 x 842 pt).
 */
export function generatePaymentReceiptPdf(data: PdfReceiptInput): Buffer {
  const cmds: string[] = [];
  const W = 595;
  const H = 842;
  const M = 48; // Margin
  const CW = W - M * 2; // 499pt content width

  const setFill = (r: number, g: number, b: number) => cmds.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`);
  const setStroke = (r: number, g: number, b: number) => cmds.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG`);
  const rectFill = (x: number, y: number, w: number, h: number) => cmds.push(`${x} ${y} ${w} ${h} re f`);
  const rectStroke = (x: number, y: number, w: number, h: number, lw = 0.8) => {
    cmds.push(`${lw} w ${x} ${y} ${w} ${h} re S`);
  };
  const hLine = (x1: number, x2: number, y: number, lw = 0.6) => {
    cmds.push(`${lw} w ${x1} ${y} m ${x2} ${y} l S`);
  };
  const text = (x: number, y: number, font: "F1" | "F2" | "F3", size: number, value: string) => {
    cmds.push(`BT /${font} ${size} Tf ${x} ${y} Td (${pdfStr(value)}) Tj ET`);
  };
  // Approximate right-aligned text using standard Helvetica/Courier widths
  const textRight = (rightX: number, y: number, font: "F1" | "F2" | "F3", size: number, value: string) => {
    const clean = pdfStr(value).replace(/\\\(|\\\)|\\\\/g, "X");
    const avgRatio = font === "F3" ? 0.6 : font === "F2" ? 0.54 : 0.50;
    const estW = clean.length * size * avgRatio;
    text(Math.max(M, Math.round(rightX - estW)), y, font, size, value);
  };

  // Cream-white page backdrop
  setFill(0.985, 0.985, 0.982);
  rectFill(0, 0, W, H);

  // Outer pure-white document frame
  setFill(1, 1, 1);
  rectFill(28, 28, W - 56, H - 56);
  setStroke(0.86, 0.85, 0.83);
  rectStroke(28, 28, W - 56, H - 56, 0.8);

  // Obsidian header banner (top of document)
  const bannerH = 98;
  const bannerY = H - 28 - bannerH;
  setFill(0.09, 0.086, 0.078); // #171614
  rectFill(28, bannerY, W - 56, bannerH);

  // Brand title in header
  setFill(1, 1, 1);
  text(M, bannerY + 56, "F2", 22, "CogniTara");
  setFill(0.75, 0.74, 0.72);
  text(M, bannerY + 34, "F1", 10, "OFFICIAL PAYMENT RECEIPT & LICENCE CERTIFICATE");
  text(M, bannerY + 18, "F3", 8.5, "cognitara.net  |  Offline School CBT Platform");

  // Status badge on right side of header
  const badgeText = data.isTest ? "PAID (TEST MODE)" : data.customerPaidMinor === 0 ? "VOUCHER REDEEMED" : "PAID & VERIFIED";
  setFill(0.18, 0.175, 0.165);
  rectFill(W - M - 134, bannerY + 46, 134, 24);
  setFill(1, 1, 1);
  text(W - M - 122, bannerY + 54, "F2", 9.5, badgeText);
  setFill(0.75, 0.74, 0.72);
  textRight(W - M, bannerY + 26, "F3", 8.5, fmtDateUtc(data.paidAt));

  // Metadata row: Billed To & Receipt Reference
  let y = bannerY - 34;
  setFill(0.45, 0.44, 0.42);
  text(M, y, "F2", 8.5, "ISSUED TO SCHOOL");
  text(M + 260, y, "F2", 8.5, "RECEIPT REFERENCE");

  y -= 18;
  setFill(0.09, 0.086, 0.078);
  text(M, y, "F2", 13.5, truncate(data.schoolName, 34));
  text(M + 260, y, "F3", 11.5, truncate(data.reference, 30));

  y -= 16;
  setFill(0.35, 0.34, 0.32);
  text(M, y, "F1", 10, truncate(data.email, 42));
  text(M + 260, y, "F1", 10, `Channel: ${truncate(data.channel, 28)}`);

  // Highlighted Licence Certificate Card (Obsidian border + cream interior)
  y -= 30;
  const cardH = 114;
  const cardY = y - cardH;
  setFill(0.968, 0.966, 0.96);
  rectFill(M, cardY, CW, cardH);
  setStroke(0.09, 0.086, 0.078);
  rectStroke(M, cardY, CW, cardH, 1.4);

  setFill(0.42, 0.41, 0.39);
  text(M + 18, cardY + cardH - 22, "F2", 8.5, "ED25519 SIGNED LICENCE KEY");
  setFill(0.09, 0.086, 0.078);
  text(M + 18, cardY + cardH - 48, "F3", 18, data.licenseKey || "PENDING ISSUANCE");

  const validLabel = data.expiresAt
    ? `Valid until ${new Date(data.expiresAt).toUTCString().slice(0, 16)}`
    : "Perpetual Institutional Licence (Never expires)";
  setFill(0.28, 0.27, 0.25);
  text(M + 18, cardY + 38, "F1", 10, `Plan: ${truncate(data.planName, 36)}   |   ${validLabel}`);
  setFill(0.45, 0.44, 0.42);
  text(M + 18, cardY + 18, "F1", 9, "Activate on Windows: Open CogniTara Studio -> Licence -> Paste Licence Key -> Activate");

  // Payment Summary Ledger
  y = cardY - 36;
  setFill(0.09, 0.086, 0.078);
  text(M, y, "F2", 11, "Payment Breakdown");
  y -= 10;
  setStroke(0.84, 0.83, 0.81);
  hLine(M, W - M, y, 0.8);

  const drawRow = (label: string, val: string, bold = false) => {
    y -= 24;
    setFill(bold ? 0.09 : 0.32, bold ? 0.086 : 0.31, bold ? 0.078 : 0.29);
    text(M, y, bold ? "F2" : "F1", bold ? 11.5 : 10.5, label);
    setFill(0.09, 0.086, 0.078);
    textRight(W - M, y, bold ? "F2" : "F3", bold ? 12 : 10.5, val);
    y -= 10;
    setStroke(0.91, 0.90, 0.89);
    hLine(M, W - M, y, 0.5);
  };

  const baseAmt = data.originalAmountMinor || data.amountMinor;
  drawRow(`CogniTara Licence - ${truncate(data.planName, 38)}`, fmtCurrencyAscii(baseAmt, data.currency));

  if (data.discountAmountMinor > 0) {
    const codeLabel = data.promoCode ? `Discount / Voucher (${data.promoCode})` : "Discount Applied";
    drawRow(codeLabel, `-${fmtCurrencyAscii(data.discountAmountMinor, data.currency)}`);
  }

  if (data.feeMinor > 0) {
    drawRow("Paystack Processing Fee", fmtCurrencyAscii(data.feeMinor, data.currency));
  }

  // Bold Total Band
  y -= 8;
  const totalBandH = 38;
  const totalBandY = y - totalBandH;
  setFill(0.09, 0.086, 0.078);
  rectFill(M, totalBandY, CW, totalBandH);
  setFill(1, 1, 1);
  text(M + 16, totalBandY + 14, "F2", 12, "TOTAL PAID");
  textRight(W - M - 16, totalBandY + 13, "F2", 14, fmtCurrencyAscii(data.customerPaidMinor, data.currency));

  // Cryptographic Integrity Verification Box
  const verifyHash = crypto
    .createHash("sha256")
    .update(`${data.reference}|${data.licenseKey || ""}|${data.customerPaidMinor}|${data.currency}`)
    .digest("hex")
    .slice(0, 32)
    .toUpperCase();

  const footY = 74;
  setStroke(0.86, 0.85, 0.83);
  hLine(M, W - M, footY + 44, 0.6);
  setFill(0.45, 0.44, 0.42);
  text(M, footY + 26, "F2", 8, "RECEIPT VERIFICATION FINGERPRINT (SHA-256)");
  text(M, footY + 12, "F3", 8.5, verifyHash);
  textRight(W - M, footY + 26, "F1", 8.5, "Support: support@cognitara.net");
  textRight(W - M, footY + 12, "F1", 8.5, "https://cognitara.net/license");

  const streamContent = cmds.join("\n") + "\n";
  const streamLen = Buffer.byteLength(streamContent, "utf8");

  // Assemble PDF 1.4 objects with exact byte xref offsets
  const objects: string[] = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> >> /Contents 7 0 R >>\nendobj\n`,
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n",
    "6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>\nendobj\n",
    `7 0 obj\n<< /Length ${streamLen} >>\nstream\n${streamContent}endstream\nendobj\n`,
  ];

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "binary")];
  const offsets: number[] = [0];
  let cursor = chunks[0].length;

  for (const obj of objects) {
    offsets.push(cursor);
    const buf = Buffer.from(obj, "utf8");
    chunks.push(buf);
    cursor += buf.length;
  }

  const xrefStart = cursor;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, "utf8"));

  return Buffer.concat(chunks);
}
