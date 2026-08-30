// 真实 TinyFish 搜索链路测试（需要 .env.local 中已配置 TINYFISH_API_KEY）
// 用法：node scripts/test-search-live.mjs [apiBase]

const BASE = process.argv[2] || "http://localhost:3000";

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

async function search(body) {
  const res = await fetch(`${BASE}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

// 1. 真实中文神话标题：应搜到原文
{
  const { json } = await search({
    title: "北欧神话 雷神托尔",
    targetLang: "zh",
  });
  console.log(
    `   [debug] isFallback=${json.isFallback} 字数=${json.wordCount} 来源=${String(json.sourceUrl).slice(0, 80)}`
  );
  check(
    "真实搜索：找到原文（≥100 字 + 来源 URL + 费用估算）",
    !!json?.rawText &&
      json.rawText.length >= 100 &&
      typeof json.sourceUrl === "string" &&
      json.sourceUrl.startsWith("http") &&
      json.wordCount > 0 &&
      json.estimatedCost > 0 &&
      json.isFallback === false,
    JSON.stringify({ wordCount: json?.wordCount, isFallback: json?.isFallback, error: json?.error })
  );
}

// 2. 真实英文神话标题：应搜到原文
{
  const { json } = await search({
    title: "The Myth of Prometheus",
    targetLang: "en",
  });
  console.log(
    `   [debug] isFallback=${json.isFallback} 字数=${json.wordCount} 来源=${String(json.sourceUrl).slice(0, 80)}`
  );
  check(
    "英文标题：找到原文（≥100 字 + 来源 URL）",
    !!json?.rawText &&
      json.rawText.length >= 100 &&
      typeof json.sourceUrl === "string" &&
      json.sourceUrl.startsWith("http") &&
      json.isFallback === false,
    JSON.stringify({ wordCount: json?.wordCount, isFallback: json?.isFallback, error: json?.error })
  );
}

// 3. 垃圾标题 + 无 LLM Key：3 次尝试后 fallbackSkipped
{
  const { json } = await search({
    title: "zzzznonexistentmyth9999",
    targetLang: "zh",
  });
  check(
    "垃圾标题：3 次尝试后 fallbackSkipped（不报错）",
    json?.fallbackSkipped === true && !!json?.error && !json?.rawText,
    JSON.stringify(json)
  );
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
