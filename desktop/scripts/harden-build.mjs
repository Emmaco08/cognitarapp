/**
 * Production anti-reverse-engineering hardening for CogniTara Studio:
 * Minifies, strips all comments/debug statements, and mangles identifiers across
 * Electron main, preload, and renderer JS files before packaging into app.asar.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { minify } from "terser";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "..", "dist");

function walkJs(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJs(full));
    else if (entry.isFile() && entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

async function run() {
  const files = walkJs(distDir);
  let totalBefore = 0;
  let totalAfter = 0;

  for (const fp of files) {
    const src = fs.readFileSync(fp, "utf8");
    totalBefore += src.length;
    const isRenderer = fp.includes(`${path.sep}renderer${path.sep}`);
    const res = await minify(src, {
      compress: {
        dead_code: true,
        drop_debugger: true,
        passes: 2,
      },
      mangle: {
        toplevel: !isRenderer,
      },
      format: {
        comments: false,
      },
    });
    if (res.code) {
      fs.writeFileSync(fp, res.code, "utf8");
      totalAfter += res.code.length;
    }
  }
  console.log(
    `[harden-build] Minified & mangled ${files.length} JS files (${Math.round(totalBefore / 1024)} KB -> ${Math.round(totalAfter / 1024)} KB).`
  );
}

run().catch((err) => {
  console.error("[harden-build] Failed:", err);
  process.exit(1);
});
