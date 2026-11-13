import http from "node:http";
import { readFile } from "node:fs/promises";

const routes = {
  "/en/preview.md": ["../docs/store/en/preview.md", "text/markdown; charset=utf-8"],
  "/en/compare.md": ["../docs/store/en/compare.md", "text/markdown; charset=utf-8"],
  "/zh-CN/preview.md": ["../docs/store/zh-CN/preview.md", "text/markdown; charset=utf-8"],
  "/zh-CN/compare.md": ["../docs/store/zh-CN/compare.md", "text/markdown; charset=utf-8"],
  "/docs/store/en/promo.html": ["../docs/store/en/promo.html", "text/html; charset=utf-8"],
  "/docs/store/zh-CN/promo.html": ["../docs/store/zh-CN/promo.html", "text/html; charset=utf-8"],
  "/docs/assets/logo.svg": ["../docs/assets/logo.svg", "image/svg+xml"]
};

http.createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  if (pathname === "/favicon.ico") { response.writeHead(204); response.end(); return; }
  const route = Object.hasOwn(routes, pathname) ? routes[pathname] : undefined;
  if (!route) { response.writeHead(404); response.end(); return; }
  try {
    const body = await readFile(new URL(route[0], import.meta.url));
    response.writeHead(200, { "content-type": route[1], "cache-control": "no-store" });
    response.end(body);
  } catch {
    response.writeHead(500); response.end("Asset source unavailable");
  }
}).listen(18766, "127.0.0.1", () => console.log("Store assets: http://127.0.0.1:18766/en/preview.md"));
