import { mkdir, copyFile, readFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
await mkdir("release", { recursive: true });
for (const [from, to] of [["docs/INSTALL.md", "INSTALL.md"], ["PRIVACY.md", "PRIVACY.md"], ["LICENSE", "LICENSE"]]) {
  await copyFile(from, `dist/${to}`);
}
const { version } = JSON.parse(await readFile("dist/manifest.json", "utf8"));
const name = `Markdown-Viewer-v${version}.zip`;
// Recreate using an explicit allowlist; never include Chrome metadata or old archive entries.
await rm(`release/${name}`, { force: true });
const files = ["manifest.json", "background.js", "content.js", "popup.js", "popup.html", "popup.css", "rules.json",
  "icons/16.png", "icons/32.png", "icons/48.png", "icons/128.png", "THIRD_PARTY_LICENSES.txt", "INSTALL.md", "PRIVACY.md", "LICENSE"];
execFileSync("zip", ["-q", `../release/${name}`, ...files], { cwd: "dist" });
console.log(`Package → release/${name}`);
