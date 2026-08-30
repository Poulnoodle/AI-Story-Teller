// 无密钥场景下的 API 冒烟测试（需要真实密钥的 happy path 请配合 .env.local 手动验证）
// 用法：node scripts/test-api.mjs [baseUrl]

const BASE = process.argv[2] || "http://localhost:3000";

async function postJson(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, text, json };
}

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`✅ ${name}`);
  } else {
    fail++;
    console.log(`❌ ${name} ${detail}`);
  }
}

// 1. /api/save 完整模板
{
  const { json } = await postJson("/api/save", {
    title: "测试：雷神托尔",
    rawText: "原始文本",
    processedText: "精修后的故事正文",
    analysis: "",
    meta: {
      sourceUrl: "https://example.com/story",
      language: "zh",
      style: "史诗感",
      cost: 0.0187,
    },
  });
  check(
    "save 返回 fileName + markdownContent",
    !!json?.fileName && !!json?.markdownContent,
    JSON.stringify(json)
  );
  check(
    "save markdown 含固定模板三段与 front-matter",
    json?.markdownContent?.includes("---\ntitle:") &&
      json?.markdownContent?.includes("# 📜 原始文本（参考）") &&
      json?.markdownContent?.includes("# ✨ 精修故事（可读版）") &&
      json?.markdownContent?.includes("# 🏺 神话解析") &&
      json?.markdownContent?.includes("（本次未生成解析）") &&
      json?.markdownContent?.includes("cost: $0.0187"),
    json?.markdownContent
  );
}

// 2. /api/search 无密钥、无 TINYFISH_API_KEY：3 次尝试失败 → fallbackSkipped
{
  const { json } = await postJson("/api/search", {
    title: "zzzznonexistentmyth9999",
    targetLang: "zh",
  });
  check(
    "search 无密钥 → fallbackSkipped + 错误提示",
    json?.fallbackSkipped === true && !!json?.error && !json?.rawText,
    JSON.stringify(json)
  );
}

// 3. /api/search 带假 LLM Key：降级 LLM 调用 → 友好错误映射
{
  const { json } = await postJson("/api/search", {
    title: "zzzznonexistentmyth9999",
    targetLang: "zh",
    userApiKey: "sk-fake-invalid-key",
    provider: "openai",
    model: "gpt-4o-mini",
  });
  check(
    "search 假 Key → isFallback + 错误信息（非崩溃）",
    json?.isFallback === true && !!json?.error && !json?.rawText,
    JSON.stringify(json)
  );
}

// 4. /api/process 缺少密钥 → SSE error 事件
{
  const res = await fetch(`${BASE}/api/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rawText: "很久以前，天上住着雷神。",
      style: "史诗感",
      needAnalysis: false,
      userApiKey: "",
      provider: "openai",
      model: "gpt-4o-mini",
    }),
  });
  const text = await res.text();
  check(
    "process 缺 Key → error 事件 + text/event-stream",
    res.headers.get("content-type")?.includes("text/event-stream") &&
      text.includes("event: error") &&
      text.includes("API Key"),
    `headers=${res.headers.get("content-type")} body=${text}`
  );
}

// 5. /api/process 假 Key：流式握手后 LLM 401 → 友好 error 事件
{
  const res = await fetch(`${BASE}/api/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rawText: "很久以前，天上住着雷神。",
      style: "史诗感",
      needAnalysis: false,
      userApiKey: "sk-fake-invalid-key",
      provider: "openai",
      model: "gpt-4o-mini",
    }),
  });
  const text = await res.text();
  // 网络可达时映射为 401 提示；不可达（如无法连接 api.openai.com）时为连接友好提示
  const mapped =
    text.includes("API Key 无效或过期") ||
    text.includes("无法连接模型服务，请检查网络或 Base URL");
  check(
    "process 假 Key → meta 后 error（LLM 错误映射）",
    text.includes("event: meta") && text.includes("event: error") && mapped,
    text
  );
}

// 6. 首页 SSR 包含全部报纸 UI 区块
{
  const res = await fetch(`${BASE}/`);
  const html = await res.text();
  for (const s of [
    "神话猎手 · THE MYTH HUNTER",
    "报社证件",
    "采编任务",
    "搜索并估价",
    "确认并生成",
    "精修故事",
    "神话解析",
    "保存 Markdown",
  ]) {
    check(`首页包含「${s}」`, html.includes(s));
  }
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
