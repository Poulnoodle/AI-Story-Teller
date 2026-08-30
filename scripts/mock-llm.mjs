// 本地 Mock LLM 服务：模拟 OpenAI 与 Anthropic 两种流式 SSE 格式
// 用于无真实密钥情况下验证 /api/process、/api/search 的完整链路
// 用法：node scripts/mock-llm.mjs [port]（默认 3999）

import http from "node:http";

const PORT = Number(process.argv[2]) || 3999;
const VALID_OPENAI_KEY = "sk-mock-valid";
const VALID_ANTHROPIC_KEY = "mock-anthropic-valid";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 根据调用类型生成确定性输出 */
function mockOutput(userMsg, system) {
  const sys = system || "";
  // 长文本合并调用
  if (userMsg.includes("【段落 1】")) {
    return (
      "[长文本摘要合并版]\n\n" +
      "在那混沌初开的岁月里，雷神托尔自天界降临。他手持神锤米约尔尼尔，目光如电，巡行于九界的边界。\n\n" +
      "巨人族的战鼓自东方响起，众神与凡人并肩而立。托尔振臂高呼，雷霆应声而至，撕裂了永夜的帷幕。\n\n" +
      "此战之后，彩虹桥重放光明，诸神的赞歌在阿斯加德回响不绝。"
    );
  }
  // 神话解析
  if (sys.includes("分析") || userMsg.includes("请从主题")) {
    return (
      "一、主题：神话围绕雷霆与守护展开，体现力量与秩序的辩证关系。\n\n" +
      "二、人物与意象：神锤米约尔尼尔象征自然之力，巨人族代表混沌的威胁。\n\n" +
      "三、文化背景与寓意：北欧先民以雷神故事解释暴风雨，寄托对丰收与安宁的渴望。"
    );
  }
  // 搜索降级（LLM 生成概要）
  if (userMsg.includes("请用中文") || userMsg.includes("请用英文")) {
    return "这是一个由 Mock LLM 生成的权威概要：故事讲述雷神托尔与巨人族的战争，展现了北欧神话中的力量与秩序主题。";
  }
  // 常规润色
  return (
    "很久很久以前，天界的主宰奥丁育有一子，名曰托尔。托尔力大无穷，司掌雷霆，众神皆敬畏之。\n\n" +
    "一日，巨人族兴兵来犯。托尔持神锤米约尔尼尔，驾羊车直入敌阵，雷霆万钧，天地变色。\n\n" +
    "自此，人间风调雨顺，托尔的威名传遍九界。"
  );
}

const server = http.createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  let parsed = {};
  try {
    parsed = JSON.parse(body || "{}");
  } catch {
    /* 忽略空请求体 */
  }

  // ---------- OpenAI 格式 ----------
  if (req.url === "/v1/chat/completions") {
    const auth = req.headers.authorization || "";
    if (!auth.includes(VALID_OPENAI_KEY)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Incorrect API key" } }));
      return;
    }
    const messages = parsed.messages || [];
    const userMsg =
      messages.find((m) => m.role === "user")?.content || "";
    const systemMsg =
      messages.find((m) => m.role === "system")?.content || "";
    const includeUsage = !!parsed.stream_options?.include_usage;
    const output = mockOutput(userMsg, systemMsg);

    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const emit = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    for (let i = 0; i < output.length; i += 8) {
      emit({
        id: "chatcmpl-mock",
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta: { content: output.slice(i, i + 8) }, finish_reason: null }],
      });
      await sleep(5);
    }
    emit({
      id: "chatcmpl-mock",
      object: "chat.completion.chunk",
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    });
    if (includeUsage) {
      emit({
        id: "chatcmpl-mock",
        object: "chat.completion.chunk",
        choices: [],
        usage: { prompt_tokens: 123, completion_tokens: 456, total_tokens: 579 },
      });
    }
    res.write("data: [DONE]\n\n");
    res.end();
    return;
  }

  // ---------- Anthropic 格式 ----------
  if (req.url === "/v1/messages") {
    const key = req.headers["x-api-key"] || "";
    if (key !== VALID_ANTHROPIC_KEY) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          type: "error",
          error: { type: "authentication_error", message: "invalid x-api-key" },
        })
      );
      return;
    }
    const userMsg =
      parsed.messages?.find((m) => m.role === "user")?.content || "";
    const output = mockOutput(userMsg, parsed.system || "");

    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const emit = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    emit({
      type: "message_start",
      message: { id: "msg_mock", usage: { input_tokens: 111, output_tokens: 1 } },
    });
    emit({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
    for (let i = 0; i < output.length; i += 8) {
      emit({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: output.slice(i, i + 8) },
      });
      await sleep(5);
    }
    emit({ type: "content_block_stop", index: 0 });
    emit({
      type: "message_delta",
      delta: { stop_reason: "end_turn" },
      usage: { output_tokens: 789 },
    });
    emit({ type: "message_stop" });
    res.end();
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, () => console.log(`mock-llm ready on :${PORT}`));
