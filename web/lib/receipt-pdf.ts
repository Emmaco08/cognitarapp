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
    .replace(new RegExp(`[${String.fromCharCode(8212)}${String.fromCharCode(8211)}]`, "g"), "-")
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
 * Official CogniTara vector paths extracted directly from web/components/CogniTaraLogo.tsx
 * (originally CogniTara-Brand-Identity/cognitara-black.svg).
 * Mark viewBox:     x ∈ [46, 132] (w=86),  y ∈ [31, 129] (h=98)
 * Wordmark viewBox: x ∈ [176, 460] (w=284), y ∈ [50, 112] (h=62)
 */
const COGNITARA_MARK_SVG_PATHS: readonly string[] = [
  "M128.09 113.09 C109.82 131.37 80.18 131.37 61.91 113.09 C43.63 94.82 43.63 65.18 61.91 46.91 C80.18 28.63 109.82 28.63 128.09 46.91 L115.22 59.78 C104.05 48.61 85.95 48.61 74.78 59.78 C63.61 70.95 63.61 89.05 74.78 100.22 C85.95 111.39 104.05 111.39 115.22 100.22 Z",
  "M100.2 63.1 C104.75 75.45 104.75 75.45 124.9 80 C104.75 84.55 104.75 84.55 100.2 96.9 C95.65 84.55 95.65 84.55 88.5 80 C95.65 75.45 95.65 75.45 100.2 63.1 Z",
];

const COGNITARA_WORDMARK_SVG_PATHS: readonly string[] = [
  "M215.692 59.388 C211.672 54.668 206.198 52 200.08 52 C187.384 52 178 62.304 178 75 C178 87.696 187.384 98 200.08 98 C206.198 98 211.672 95.332 215.692 90.612 L212.569 87.489 C209.188 91.33 204.864 93.584 200.08 93.584 C189.822 93.584 182.416 85.258 182.416 75 C182.416 64.742 189.822 56.416 200.08 56.416 C204.864 56.416 209.188 58.67 212.569 62.511 Z",
  "M235.04 64.88 C243.688 64.88 250.68 72.24 250.68 81.44 C250.68 90.64 243.688 98 235.04 98 C226.392 98 219.4 90.64 219.4 81.44 C219.4 72.24 226.392 64.88 235.04 64.88 Z M235.04 69.296 C228.83 69.296 223.816 74.724 223.816 81.44 C223.816 88.156 228.83 93.584 235.04 93.584 C241.25 93.584 246.264 88.156 246.264 81.44 C246.264 74.724 241.25 69.296 235.04 69.296 Z",
  "M269.08 64.88 C272.99 64.88 276.44 67.18 278.97 70.63 L278.97 65.57 L283.11 65.57 L283.11 98 C283.11 105.13 278.05 109.73 269.77 109.73 C264.02 109.73 259.19 107.43 256.66 103.52 L259.88 101.45 C261.72 104.44 265.17 106.28 269.54 106.28 C274.83 106.28 278.97 103.75 278.97 98 L278.97 91.79 C276.44 95.47 272.76 97.31 268.85 97.31 C260.8 97.31 254.36 90.18 254.36 81.21 C254.36 72.24 260.938 64.88 269.08 64.88 Z M269.08 69.296 C263.1 69.296 258.776 74.54 258.776 81.21 C258.776 87.88 263.1 92.94 269.08 92.94 C275.06 92.94 278.97 87.696 278.97 81.21 C278.97 74.54 275.06 69.296 269.08 69.296 Z",
  "M286.56 65.57 L290.976 65.57 L290.976 72.7 C293 67.87 297.37 64.88 302.66 64.88 C309.79 64.88 315.586 69.48 315.586 77.99 L315.586 98 L311.17 98 L311.17 78.68 C311.17 72.7 307.72 69.296 302.66 69.296 C297.6 69.296 293 72.01 290.976 77.07 L290.976 98 L286.56 98 Z",
  "M319.68 65.57 L324.096 65.57 L324.096 98 L319.68 98 Z",
  "M321.888 54.99 C322.808 57.52 322.808 57.52 325.338 58.44 C322.808 59.36 322.808 59.36 321.888 61.89 C320.968 59.36 320.968 59.36 318.438 58.44 C320.968 57.52 320.968 57.52 321.888 54.99 Z",
  "M332.56 52 L364.76 52 L364.76 54.944 L363.288 56.416 L350.868 56.416 L350.868 98 L346.452 98 L346.452 56.416 L334.032 56.416 L332.56 54.944 Z",
  "M382.7 64.88 C387.76 64.88 391.44 67.41 393.28 71.32 L393.28 65.57 L397.696 65.57 L397.696 98 L393.28 98 L393.28 90.87 C391.44 95.01 387.76 98 382.7 98 C374.88 98 368.44 90.64 368.44 81.44 C368.44 72.24 374.88 64.88 382.7 64.88 Z M383.16 69.296 C376.95 69.296 372.856 74.54 372.856 81.44 C372.856 88.34 376.95 93.584 383.16 93.584 C389.37 93.584 393.28 88.34 393.28 81.44 C393.28 74.54 389.37 69.296 383.16 69.296 Z",
  "M401.56 65.57 L405.976 65.57 L405.976 73.16 C407.54 68.1 411.22 64.88 416.51 64.88 C419.04 64.88 421.57 65.892 423.548 67.548 L422.26 70.86 C420.88 69.94 419.04 69.296 417.2 69.296 C412.14 69.296 407.77 71.55 405.976 77.07 L405.976 98 L401.56 98 Z",
  "M443.42 64.88 C448.48 64.88 452.16 67.41 454 71.32 L454 65.57 L458.416 65.57 L458.416 98 L454 98 L454 90.87 C452.16 95.01 448.48 98 443.42 98 C435.6 98 429.16 90.64 429.16 81.44 C429.16 72.24 435.6 64.88 443.42 64.88 Z M443.88 69.296 C437.67 69.296 433.576 74.54 433.576 81.44 C433.576 88.34 437.67 93.584 443.88 93.584 C450.09 93.584 454 88.34 454 81.44 C454 74.54 450.09 69.296 443.88 69.296 Z",
];

/**
 * Converts an absolute SVG path (M, L, C, Z) to native PDF 1.4 vector path operators.
 * Uses even-odd fill (`f*`) so glyph inner counters (o, g, a) punch out cleanly in all PDF viewers.
 */
function svgPathToPdfOps(d: string): string {
  const tokens = d.match(/[MLCZ]|-?\d*\.?\d+/g) || [];
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === "M") {
      const x = tokens[i++];
      const y = tokens[i++];
      out.push(`${x} ${y} m`);
    } else if (cmd === "L") {
      const x = tokens[i++];
      const y = tokens[i++];
      out.push(`${x} ${y} l`);
    } else if (cmd === "C") {
      const x1 = tokens[i++];
      const y1 = tokens[i++];
      const x2 = tokens[i++];
      const y2 = tokens[i++];
      const x = tokens[i++];
      const y = tokens[i++];
      out.push(`${x1} ${y1} ${x2} ${y2} ${x} ${y} c`);
    } else if (cmd === "Z") {
      out.push("h");
    }
  }
  out.push("f*");
  return out.join("\n");
}

const PDF_MARK_OPS = COGNITARA_MARK_SVG_PATHS.map(svgPathToPdfOps).join("\n");
const PDF_WORDMARK_OPS = COGNITARA_WORDMARK_SVG_PATHS.map(svgPathToPdfOps).join("\n");

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
  const estimateTextWidth = (font: "F1" | "F2" | "F3", size: number, value: string): number => {
    const clean = pdfStr(value).replace(/\\\(|\\\)|\\\\/g, "X");
    const isAllCaps = /[A-Z]/.test(clean) && clean === clean.toUpperCase();
    const avgRatio = font === "F3" ? 0.6 : font === "F2" ? (isAllCaps ? 0.66 : 0.55) : isAllCaps ? 0.62 : 0.50;
    return clean.length * size * avgRatio;
  };
  const textRight = (rightX: number, y: number, font: "F1" | "F2" | "F3", size: number, value: string) => {
    const estW = estimateTextWidth(font, size, value);
    text(Math.max(M, Math.round(rightX - estW)), y, font, size, value);
  };
  const textCenter = (centerX: number, y: number, font: "F1" | "F2" | "F3", size: number, value: string) => {
    const estW = estimateTextWidth(font, size, value);
    text(Math.round(centerX - estW / 2), y, font, size, value);
  };

  // Native infinite-resolution vector CogniTara emblem (viewBox 46..132, 31..129)
  const drawCogniTaraMark = (xLeft: number, yTop: number, heightPt: number) => {
    const s = heightPt / 98;
    const tx = xLeft - 46 * s;
    const ty = yTop + 31 * s;
    cmds.push(`q ${s.toFixed(5)} 0 0 ${(-s).toFixed(5)} ${tx.toFixed(3)} ${ty.toFixed(3)} cm`);
    cmds.push(PDF_MARK_OPS);
    cmds.push("Q");
  };

  // Native infinite-resolution vector CogniTara wordmark (viewBox 176..460, 50..112)
  const drawCogniTaraWordmark = (xLeft: number, yTop: number, heightPt: number) => {
    const s = heightPt / 62;
    const tx = xLeft - 176 * s;
    const ty = yTop + 50 * s;
    cmds.push(`q ${s.toFixed(5)} 0 0 ${(-s).toFixed(5)} ${tx.toFixed(3)} ${ty.toFixed(3)} cm`);
    cmds.push(PDF_WORDMARK_OPS);
    cmds.push("Q");
  };

  // Official horizontal brand lockup (emblem + geometric wordmark) centered on yCenter
  const drawCogniTaraLockup = (xLeft: number, yCenter: number, markHeightPt: number, wordmarkHeightPt: number) => {
    const markWidthPt = markHeightPt * (86 / 98);
    const gapPt = Math.max(7, markHeightPt * 0.34);
    drawCogniTaraMark(xLeft, yCenter + markHeightPt / 2, markHeightPt);
    // Align wordmark cap-center (SVG y=75 inside 50..112) directly with mark center
    const wordScale = wordmarkHeightPt / 62;
    const wordYTop = yCenter + (75 - 50) * wordScale;
    drawCogniTaraWordmark(xLeft + markWidthPt + gapPt, wordYTop, wordmarkHeightPt);
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
  const bannerH = 108;
  const bannerY = H - 28 - bannerH;
  setFill(0.09, 0.086, 0.078); // #171614
  rectFill(28, bannerY, W - 56, bannerH);

  // Official pure-white CogniTara vector logo lockup in header
  setFill(1, 1, 1);
  drawCogniTaraLockup(M, bannerY + 71, 26, 21);

  setFill(0.76, 0.75, 0.72);
  text(M, bannerY + 35, "F1", 9.5, "OFFICIAL PAYMENT RECEIPT & LICENCE CERTIFICATE");
  setFill(0.62, 0.61, 0.58);
  text(M, bannerY + 19, "F3", 8.5, "cognitara.net  |  Offline School CBT Platform");

  // Status badge on right side of header (with hairline frame and centered label)
  const badgeText = data.isTest ? "PAID (TEST MODE)" : data.customerPaidMinor === 0 ? "VOUCHER REDEEMED" : "PAID & VERIFIED";
  const badgeW = 142;
  const badgeH = 24;
  const badgeX = W - M - badgeW;
  const badgeY = bannerY + 56;
  setFill(0.16, 0.155, 0.145);
  rectFill(badgeX, badgeY, badgeW, badgeH);
  setStroke(0.28, 0.27, 0.25);
  rectStroke(badgeX, badgeY, badgeW, badgeH, 0.7);
  setFill(1, 1, 1);
  textCenter(badgeX + badgeW / 2, badgeY + 8.5, "F2", 9, badgeText);
  setFill(0.75, 0.74, 0.72);
  textRight(W - M, bannerY + 34, "F3", 8.5, fmtDateUtc(data.paidAt));

  // Metadata row: Billed To & Receipt Reference
  let y = bannerY - 34;
  setFill(0.45, 0.44, 0.42);
  text(M, y, "F2", 8.5, "ISSUED TO SCHOOL");
  text(M + 260, y, "F2", 8.5, "RECEIPT REFERENCE");

  y -= 18;
  setFill(0.09, 0.086, 0.078);
  const schoolFontSize = data.schoolName.trim().length > 28 ? 11.5 : 13.5;
  text(M, y, "F2", schoolFontSize, truncate(data.schoolName, 40));
  text(M + 260, y, "F3", 11.5, truncate(data.reference, 30));

  y -= 16;
  setFill(0.35, 0.34, 0.32);
  text(M, y, "F1", 10, truncate(data.email, 42));
  text(M + 260, y, "F1", 10, `Channel: ${truncate(data.channel, 28)}`);

  // Highlighted Licence Certificate Card (Obsidian border + cream interior + official emblem crest)
  y -= 30;
  const cardH = 116;
  const cardY = y - cardH;
  setFill(0.968, 0.966, 0.96);
  rectFill(M, cardY, CW, cardH);
  setStroke(0.09, 0.086, 0.078);
  rectStroke(M, cardY, CW, cardH, 1.4);

  // Subtle official obsidian CogniTara mark crest in top-right of Licence Certificate Card
  setFill(0.09, 0.086, 0.078);
  drawCogniTaraMark(M + CW - 36, cardY + cardH - 16, 20);

  setFill(0.42, 0.41, 0.39);
  text(M + 18, cardY + cardH - 22, "F2", 8.5, "ED25519 SIGNED LICENCE KEY");
  setFill(0.09, 0.086, 0.078);
  text(M + 18, cardY + cardH - 49, "F3", 18, data.licenseKey || "PENDING ISSUANCE");

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
