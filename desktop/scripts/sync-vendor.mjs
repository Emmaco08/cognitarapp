/**
 * Bundles official browser-ready vendor SDKs (Paystack InlineJS v2) from node_modules
 * directly into the Electron renderer output so zero remote CDN script tags or <webview>
 * wrappers are ever required inside CogniTara Studio.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");

const paystackSrc = path.join(desktopRoot, "node_modules", "@paystack", "inline-js", "dist", "inline.js");
if (!fs.existsSync(paystackSrc)) {
  console.error(`[sync-vendor] Missing @paystack/inline-js bundle at ${paystackSrc}. Run npm install in desktop/.`);
  process.exit(1);
}

const targets = [
  path.join(desktopRoot, "src", "renderer", "vendor", "paystack-inline.js"),
  path.join(desktopRoot, "dist", "renderer", "vendor", "paystack-inline.js"),
];

for (const dst of targets) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(paystackSrc, dst);
}

const bytes = fs.statSync(paystackSrc).size;
console.log(`[sync-vendor] Synced @paystack/inline-js (${Math.round(bytes / 1024)} KB) into renderer vendor bundle.`);
