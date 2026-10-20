import { build } from "esbuild";
import { mkdir, copyFile, writeFile, readFile, rm } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, "icons"), { recursive: true });
await build({
  absWorkingDir: root, entryPoints: ["src/content.js", "src/background.js", "src/popup.js"],
  outdir: dist, bundle: true, minify: true, format: "iife", target: "chrome128",
  loader: { ".css": "text" }, legalComments: "eof"
});
await copyFile(path.join(root, "manifest.json"), path.join(dist, "manifest.json"));
await copyFile(path.join(root, "src/popup.html"), path.join(dist, "popup.html"));
await copyFile(path.join(root, "src/popup.css"), path.join(dist, "popup.css"));
const action = {
  type: "modifyHeaders",
  responseHeaders: [
    { header: "content-type", operation: "set", value: "text/plain; charset=utf-8" },
    { header: "content-disposition", operation: "remove" }
  ]
};
const rules = [
  {
    id: 1, priority: 1, action,
    condition: {
      resourceTypes: ["main_frame"],
      responseHeaders: [{ header: "content-type", values: ["text/markdown", "text/markdown;*", "text/x-markdown", "text/x-markdown;*", "application/markdown", "application/markdown;*", "application/x-markdown", "application/x-markdown;*"] }]
    }
  },
  {
    id: 2, priority: 1, action,
    condition: {
      resourceTypes: ["main_frame"],
      regexFilter: "^https?://[^?#]+\\.(md|markdown|mdown|mkdn)([?#].*)?$",
      isUrlFilterCaseSensitive: false,
      responseHeaders: [{ header: "content-type", values: ["application/octet-stream", "application/octet-stream;*"] }]
    }
  },
  {
    id: 3, priority: 1,
    action: { type: "modifyHeaders", responseHeaders: [{ header: "content-disposition", operation: "remove" }] },
    condition: {
      resourceTypes: ["main_frame"],
      regexFilter: "^https?://[^?#]+\\.(md|markdown|mdown|mkdn)([?#].*)?$",
      isUrlFilterCaseSensitive: false,
      responseHeaders: [{ header: "content-type", values: ["text/plain", "text/plain;*"] }]
    }
  }
];
await writeFile(path.join(dist, "rules.json"), JSON.stringify(rules, null, 2));
// Small code-native icon, no runtime image dependency.
function crc32(data) {
  let c = 0xffffffff;
  for (const byte of data) {
    c ^= byte;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(name, data) {
  const type = Buffer.from(name);
  const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([type, data])));
  return Buffer.concat([size, type, data, crc]);
}
function makeIcon(size) {
  const pixels = Buffer.alloc((size * 4 + 1) * size);
  const glyph = ["100010010","110110010","101010010","100010010","100010111","100010010"];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    const inset = size === 128 ? 16 : 0;
    const px = (x - inset) / (size - inset * 2), py = (y - inset) / (size - inset * 2);
    const gx = Math.floor((px - .18) / .071), gy = Math.floor((py - .30) / .071);
    const ink = gx >= 0 && gx < 9 && gy >= 0 && gy < 6 && glyph[gy][gx] === "1";
    const dx = Math.max(.17 - px, 0, px - .83), dy = Math.max(.17 - py, 0, py - .83);
    const alpha = dx * dx + dy * dy > .17 ** 2 ? 0 : 255;
    pixels.set(ink ? [255, 255, 255, alpha] : [24, 62, 59, alpha], offset);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}
for (const size of [16, 32, 48, 128]) await writeFile(path.join(dist, `icons/${size}.png`), makeIcon(size));
const packages = ["marked", "dompurify", "highlight.js", "diff"];
let notices = "Markdown Viewer — third-party licenses\n\n";
for (const name of packages) {
  const pkg = JSON.parse(await readFile(path.join(root, "node_modules", name, "package.json"), "utf8"));
  notices += `${name} ${pkg.version}\n`;
  for (const file of ["LICENSE", "LICENSE.md", "LICENSE.txt"]) {
    try { notices += await readFile(path.join(root, "node_modules", name, file), "utf8"); break; } catch {}
  }
  notices += "\n\n";
}
await writeFile(path.join(dist, "THIRD_PARTY_LICENSES.txt"), notices);
console.log("Built extension → dist/");
