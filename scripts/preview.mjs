// 本地静态预览：把 out/ 挂载在 basePath（/AI-Story-Teller）下，模拟 GitHub Pages 的路径结构
// 用法：node scripts/preview.mjs [port]（默认 3000）

import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, extname, join, normalize } from "node:path";

const PORT = Number(process.argv[2]) || 3000;
const BASE_PATH = "/AI-Story-Teller";
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "out");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname !== BASE_PATH && !url.pathname.startsWith(BASE_PATH + "/")) {
    // 根路径跳到站点首页
    res.writeHead(302, { Location: BASE_PATH + "/" });
    res.end();
    return;
  }
  let rel = url.pathname.slice(BASE_PATH.length) || "/";
  if (rel.endsWith("/")) rel += "index.html";
  const file = normalize(join(OUT_DIR, rel));
  if (!file.startsWith(normalize(OUT_DIR))) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
    });
    res.end(data);
  } catch {
    // 404.html 兜底（与 GitHub Pages 行为一致）
    try {
      const data = await readFile(join(OUT_DIR, "404.html"));
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  }
});

server.listen(PORT, "0.0.0.0", () =>
  console.log(`preview: http://localhost:${PORT}${BASE_PATH}/`)
);
