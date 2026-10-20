import http from "node:http";
import { readFile } from "node:fs/promises";
const demo = await readFile(new URL("../fixtures/demo.md", import.meta.url), "utf8");
const counts = {};
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname === "/counts") { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(counts)); return; }
  counts[pathname] = (counts[pathname] || 0) + 1;
  res.setHeader("cache-control", "no-store");
  let type = "text/markdown; charset=utf-8";
  let body = demo;
  if (pathname === "/plain" || pathname === "/README.md") type = "text/plain; charset=utf-8";
  else if (pathname === "/plain-paragraph") { type = "text/plain; charset=utf-8"; body = "This is an ordinary plain text response."; }
  else if (pathname === "/diff") body = "# Markdown Viewer 使用说明\n\n## 项目说明\n名称：Markdown Viewer\n用途：自动预览 Markdown 文档。\n\n## 功能\n- 原文查看\n- 手动刷新预览\n- 代码高亮\n\n## 使用提示\n编辑仅在当前页面有效。\n请另存为文件，刷新会恢复原文。\n\n## 更多说明\n" + Array.from({ length: 80 }, (_, i) => `第 ${i + 1} 条说明：支持 Markdown 文档。\n`).join("");
  else if (pathname === "/mime-paragraph") body = "Markdown can also consist of a plain paragraph.";
  else if (pathname === "/application-markdown") type = "application/markdown";
  else if (pathname === "/attachment") res.setHeader("content-disposition", "attachment; filename=document.md");
  else if (pathname === "/binary.md") { type = "application/octet-stream"; res.setHeader("content-disposition", "attachment; filename=binary.md"); }
  else if (pathname === "/html" || pathname === "/html.md") { type = "text/html; charset=utf-8"; body = "<!doctype html><title>普通网页</title><h1>这是普通网页</h1><p>不要接管这个页面。</p>"; }
  else if (pathname === "/json") { type = "application/json"; body = '{"title":"# Markdown","body":"## Heading"}'; }
  else if (pathname === "/xss") body = `# Security\n\n<script>window.__xss=1</script><img src="/tracker" onerror="window.__xss=2"><a href="javascript:window.__xss=3">Bad link</a><iframe src="/tracker"></iframe><form action="/tracker"><input name="x"></form><style>body{display:none}</style>\n\n[bad](javascript:alert(1))`;
  else if (pathname === "/duplicate") body = "# 重复标题\n\n## 重复标题\n\n## 重复标题\n\n[跳转](#重复标题-2)";
  else if (pathname === "/csp") res.setHeader("content-security-policy", "default-src 'none'; style-src 'none'; img-src 'none'; script-src 'none'");
  else if (pathname === "/large") body = "# Large\n\n" + "a".repeat(3 * 1024 * 1024);
  else if (pathname === "/pixel.svg") { type = "image/svg+xml"; body = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80"><rect width="240" height="80" fill="#147d73"/><text x="24" y="47" fill="white" font-size="20">Markdown Viewer</text></svg>'; }
  else if (pathname === "/favicon.ico") { res.statusCode = 204; body = ""; }
  else if (pathname === "/redirect") { res.writeHead(302, { location: "/api/docs" }); res.end(); return; }
  res.setHeader("content-type", type);
  res.end(body);
});
server.listen(18765, "127.0.0.1", () => console.log("Test fixtures: http://127.0.0.1:18765/api/docs"));
