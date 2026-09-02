// 供应商无关的 LLM 流式调用核心
// 统一 OpenAI 兼容格式（DeepSeek 等 /chat/completions），原生 fetch，不引入 SDK
// 静态版浏览器直连：官方 openai.com / anthropic.com 不支持 CORS，已移除
// 注意：任何地方都不得打印 apiKey

import { DEFAULT_BASE_URLS } from "./constants";
import type { LLMCallOpts, LLMResult } from "./types";

export class LLMError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "LLMError";
    this.status = status;
  }
}

/** 把 HTTP 状态映射为对用户友好的中文错误 */
function friendlyError(status: number, body?: string): string {
  if (status === 401 || status === 403) return "API Key 无效或过期";
  if (status === 429) return "请求过于频繁，请稍后重试";
  if (status === 404) return "模型不存在或端点地址错误";
  const snippet = body ? body.replace(/\s+/g, " ").slice(0, 120) : "";
  return `模型服务错误：HTTP ${status}${snippet ? `（${snippet}）` : ""}`;
}

/**
 * 解析调用端点：
 * - custom：用户填写的 Base URL 为唯一端点（必填，需含 /v1）
 * - openai：用户填写的 Base URL 为主端点；留空 = DeepSeek 默认（api.deepseek.com）
 */
function resolveBase(opts: LLMCallOpts): string {
  const userBase = (opts.baseUrl ?? "").trim().replace(/\/+$/, "");
  if (opts.provider === "custom") {
    if (!userBase) throw new LLMError("自定义端点需填写 Base URL（含 /v1）");
    return userBase;
  }
  return userBase || DEFAULT_BASE_URLS.openai;
}

function openAIBody(opts: LLMCallOpts): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    stream: true,
    temperature: 0.8,
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  return body;
}

async function callOpenAI(
  endpoint: string,
  opts: LLMCallOpts,
  body: Record<string, unknown>
): Promise<Response> {
  return fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
}

async function streamOpenAICompatible(opts: LLMCallOpts): Promise<LLMResult> {
  const endpoint = `${resolveBase(opts)}/chat/completions`;
  const body = openAIBody(opts);

  // stream_options 用于回传 usage；部分兼容端点不支持（400），降级重试一次
  let res = await callOpenAI(endpoint, opts, {
    ...body,
    stream_options: { include_usage: true },
  });
  if (res.status === 400) {
    res = await callOpenAI(endpoint, opts, body);
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(`[llm] ${endpoint} -> HTTP ${res.status}: ${errText.slice(0, 200)}`);
    throw new LLMError(friendlyError(res.status, errText), res.status);
  }
  // 传输层失败（fetch TypeError / AbortError）原样抛出，由调用方决定是否重试
  const result = await parseOpenAIStream(
    res.body as ReadableStream<Uint8Array>,
    opts.onDelta
  );
  console.log(
    `[llm] ${endpoint} ok: text=${result.text.length} in=${result.inputTokens} out=${result.outputTokens}`
  );
  return result;
}

/** 流式调用 LLM，返回完整文本与 token 用量 */
export async function streamLLM(opts: LLMCallOpts): Promise<LLMResult> {
  return streamOpenAICompatible(opts);
}

/** 非流式场景（如搜索降级）复用同一实现，仅收集最终文本 */
export async function completeLLM(opts: LLMCallOpts): Promise<LLMResult> {
  return streamLLM(opts);
}

async function parseOpenAIStream(
  body: ReadableStream<Uint8Array>,
  onDelta?: (text: string) => void
): Promise<LLMResult> {
  const decoder = new TextDecoder("utf-8");
  const reader = body.getReader();
  let text = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload);
        const delta: unknown = json.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) {
          text += delta;
          onDelta?.(delta);
        }
        if (json.usage) {
          inputTokens = json.usage.prompt_tokens ?? inputTokens;
          outputTokens = json.usage.completion_tokens ?? outputTokens;
        }
      } catch {
        // 忽略无法解析的行
      }
    }
  }
  return { text, inputTokens, outputTokens };
}
