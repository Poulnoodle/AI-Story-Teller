// 端到端 LLM 链路测试：启动本地 Mock LLM（OpenAI/Anthropic 两种流式格式），
// 验证 /api/process 的短文本、长文本分块、解析、双供应商流式解析、错误映射，
// 以及 /api/search 的 LLM 降级路径。
// 用法：node scripts/test-api-llm.mjs [apiBase] [mockPort]

import { spawn } from "node:child_process";

const BASE = process.argv[2] || "http://localhost:3000";
const MOCK_PORT = process.argv[3] || "3999";
const MOCK_BASE = `http://localhost:${MOCK_PORT}`;
// OpenAI 格式约定：Base URL 含 /v1（如 https://api.openai.com/v1）
const OPENAI_BASE = `${MOCK_BASE}/v1`;
const OPENAI_KEY = "sk-mock-valid";
const ANTHROPIC_KEY = "mock-anthropic-valid";

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

/** 读取 SSE 响应，返回按序解析的帧 [{event, data}] */
async function postSSE(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const frames = [];
  for (const frame of text.split("\n\n")) {
    if (!frame.trim()) continue;
    let event = "message";
    const dataLines = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length) {
      try {
        frames.push({ event, data: JSON.parse(dataLines.join("\n")) });
      } catch {
        /* 忽略 */
      }
    }
  }
  return frames;
}

const framesOf = (frames, event) => frames.filter((f) => f.event === event);
const concatOf = (frames, event) =>
  framesOf(frames, event)
    .map((f) => f.data.delta)
    .join("");

// 长文本输入（>8000 CJK 汉字）
const longPara =
  "盘古开天辟地，女娲抟土造人，共工怒触不周之山，天倾西北，地陷东南，洪水滔天，生灵涂炭。";
const longText = Array.from({ length: 200 }, (_, i) => `${longPara}（第${i}段）`).join(
  "\n\n"
);

async function main() {
  // 启动 Mock LLM
  const mock = spawn("node", ["scripts/mock-llm.mjs", MOCK_PORT], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise((resolve, reject) => {
    mock.stdout.on("data", (d) => {
      if (String(d).includes("mock-llm ready")) resolve();
    });
    mock.on("error", reject);
    setTimeout(() => reject(new Error("mock-llm 启动超时")), 10000);
  });

  // 1. 短文本 + 自定义端点（OpenAI 格式）：meta → chunk → usage → done
  {
    const frames = await postSSE("/api/process", {
      rawText: "很久以前，天上住着雷神。",
      style: "史诗感",
      needAnalysis: false,
      userApiKey: OPENAI_KEY,
      provider: "custom",
      model: "mock-model",
      baseUrl: OPENAI_BASE,
      title: "雷神托尔",
    });
    const story = concatOf(frames, "chunk");
    const usage = framesOf(frames, "usage");
    check(
      "短文本：事件顺序 meta→chunk…→usage→done",
      frames[0]?.event === "meta" &&
        frames[0]?.data?.mode === "normal" &&
        story.length > 100 &&
        usage.length === 1 &&
        frames.at(-1)?.event === "done",
      JSON.stringify(frames.map((f) => f.event))
    );
    check(
      "短文本：usage 按 token 计费（0.0012）",
      usage[0]?.data?.estimatedCost === 0.0012,
      JSON.stringify(usage[0]?.data)
    );
  }

  // 2. 短文本 + 解析：analysis_chunk 流式输出
  {
    const frames = await postSSE("/api/process", {
      rawText: "很久以前，天上住着雷神。",
      style: "史诗感",
      needAnalysis: true,
      userApiKey: OPENAI_KEY,
      provider: "custom",
      model: "mock-model",
      baseUrl: OPENAI_BASE,
      title: "雷神托尔",
    });
    const story = concatOf(frames, "chunk");
    const analysis = concatOf(frames, "analysis_chunk");
    check(
      "解析：analysis_chunk 流式输出 + 两次 usage + done",
      story.length > 100 &&
        analysis.includes("主题") &&
        framesOf(frames, "usage").length === 2 &&
        frames.at(-1)?.event === "done",
      JSON.stringify({ storyLen: story.length, analysis, events: frames.map((f) => f.event) })
    );
  }

  // 3. 长文本：分块并发 + progress + 合并（[长文本摘要合并版]）
  {
    const frames = await postSSE("/api/process", {
      rawText: longText,
      style: "史诗感",
      needAnalysis: false,
      userApiKey: OPENAI_KEY,
      provider: "custom",
      model: "mock-model",
      baseUrl: OPENAI_BASE,
      title: "长文本测试",
    });
    const meta = frames[0]?.data;
    const progress = framesOf(frames, "progress");
    const story = concatOf(frames, "chunk");
    const usageCount = framesOf(frames, "usage").length;
    check(
      "长文本：meta mode=long + progress 逐块推进",
      meta?.mode === "long" &&
        meta?.chunks >= 3 &&
        progress.length === meta.chunks &&
        progress.at(-1)?.data?.done === meta.chunks,
      JSON.stringify({ meta, progress: progress.map((p) => p.data) })
    );
    check(
      "长文本：合并输出以 [长文本摘要合并版] 开头 + 每块+合并的 usage + done",
      story.startsWith("[长文本摘要合并版]") &&
        usageCount === meta.chunks + 1 &&
        frames.at(-1)?.event === "done",
      JSON.stringify({ head: story.slice(0, 30), usageCount, events: frames.map((f) => f.event) })
    );
  }

  // 4. Anthropic 格式：x-api-key 流式解析
  {
    const frames = await postSSE("/api/process", {
      rawText: "很久以前，天上住着雷神。",
      style: "史诗感",
      needAnalysis: false,
      userApiKey: ANTHROPIC_KEY,
      provider: "anthropic",
      model: "claude-mock",
      baseUrl: MOCK_BASE,
    });
    const story = concatOf(frames, "chunk");
    check(
      "Anthropic：message_start/delta 流式解析成功",
      story.length > 100 && frames.at(-1)?.event === "done",
      JSON.stringify({ storyLen: story.length, events: frames.map((f) => f.event) })
    );
  }

  // 5. 错误映射：假 Key → error 事件（401 → 友好提示）
  {
    const frames = await postSSE("/api/process", {
      rawText: "很久以前，天上住着雷神。",
      style: "史诗感",
      needAnalysis: false,
      userApiKey: "sk-wrong",
      provider: "custom",
      model: "mock-model",
      baseUrl: OPENAI_BASE,
    });
    const err = framesOf(frames, "error")[0]?.data?.message;
    check(
      "错误映射：401 → 「API Key 无效或过期」",
      err === "API Key 无效或过期",
      JSON.stringify(err)
    );
  }

  // 6. /api/search 降级：无 TINYFISH_API_KEY 时走 Mock LLM 概要 + ⚠️ 标记包裹
  {
    const res = await fetch(`${BASE}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "zzzznonexistentmyth9999",
        targetLang: "zh",
        userApiKey: OPENAI_KEY,
        provider: "custom",
        model: "mock-model",
        baseUrl: OPENAI_BASE,
      }),
    });
    const json = await res.json();
    const marker = "[⚠️ AI 重构，未经原始文献核实]";
    check(
      "搜索降级：isFallback + ⚠️ 标记前后包裹 + 非空原文",
      json?.isFallback === true &&
        json?.rawText?.startsWith(marker) &&
        json?.rawText?.endsWith(marker) &&
        json?.rawText?.length > marker.length * 2 + 20,
      JSON.stringify(json)
    );
    check(
      "搜索降级：费用按字数估算",
      typeof json?.estimatedCost === "number" && json?.estimatedCost > 0,
      JSON.stringify(json?.estimatedCost)
    );
  }

  // 7. Base URL 作为主端点：provider=openai + 自定义 Base URL（Mock）直接生成
  {
    const frames = await postSSE("/api/process", {
      rawText: "很久以前，天上住着雷神。",
      style: "史诗感",
      needAnalysis: false,
      userApiKey: OPENAI_KEY,
      provider: "openai",
      model: "mock-model",
      baseUrl: OPENAI_BASE,
    });
    const story = concatOf(frames, "chunk");
    const err = framesOf(frames, "error")[0]?.data?.message;
    const okViaPrimary = story.length > 100 && frames.at(-1)?.event === "done";
    console.log(`   [debug] viaPrimary=${okViaPrimary} 字数=${story.length} err=${err}`);
    check(
      "Base URL 主端点：provider=openai 直接走自定义端点完成生成",
      okViaPrimary,
      JSON.stringify({ err, events: frames.map((f) => f.event) })
    );
  }

  // 8. 端点回退：主端点（无人监听的端口）连接失败 → 自动回退官方端点
  {
    const closedPortBase = `http://localhost:${Number(MOCK_PORT) - 1}/v1`;
    const frames = await postSSE("/api/process", {
      rawText: "很久以前，天上住着雷神。",
      style: "史诗感",
      needAnalysis: false,
      userApiKey: OPENAI_KEY,
      provider: "openai",
      model: "mock-model",
      baseUrl: closedPortBase,
    });
    const err = framesOf(frames, "error")[0]?.data?.message;
    // 主端点失败 → 回退官方：官方不可达时报“均连接失败”，可达时报 401（假 Key）
    const ok =
      (err && err.includes("无法连接模型服务")) || err === "API Key 无效或过期";
    console.log(`   [debug] err=${err}`);
    check(
      "端点回退：主端点失败自动回退官方（官方不可达时报友好错误）",
      ok,
      JSON.stringify({ err, events: frames.map((f) => f.event) })
    );
  }

  mock.kill();
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error("测试脚本异常：", err);
  process.exit(1);
});
