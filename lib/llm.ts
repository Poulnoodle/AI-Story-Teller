// 供应商无关的 LLM 流式调用核心
// 支持 OpenAI 格式、Anthropic Messages API、自定义 OpenAI 兼容端点（统一用原生 fetch，不引入 SDK）
// 注意：任何地方都不得打印 apiKey

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

/** 把网络层错误（fetch 失败/连接超时）映射为友好提示 */
function wrapNetworkError(err: unknown): never {
  if (err instanceof LLMError) throw err;
  const cause = (err as { cause?: { code?: string } })?.cause?.code ?? "";
  if (typeof cause === "string" && cause.startsWith("UND_ERR")) {
    throw new LLMError("无法连接模型服务，请检查网络或 Base URL");
  }
  throw new LLMError("模型服务请求失败，请稍后重试");
}

/** 流式调用 LLM，返回完整文本与 token 用量 */
export async function streamLLM(opts: LLMCallOpts): Promise<LLMResult> {
  if (opts.provider === "anthropic") return streamAnthropic(opts);
  return streamOpenAICompatible(opts);
}

/** 非流式场景（如搜索降级）复用同一实现，仅收集最终文本 */
export async function completeLLM(opts: LLMCallOpts): Promise<LLMResult> {
  return streamLLM(opts);
}

// ---------- OpenAI 兼容格式（openai / custom） ----------

const DEFAULT_OPENAI_BASE = "https://api.openai.com/v1";

/** 网络层失败过（连接超时等）的端点，后续调用直接跳过，避免重复等待 */
const unreachableBases = new Set<string>();

/** 判断是否为网络层失败（连接超时/拒绝/解析失败），HTTP 错误不算 */
function isNetworkError(err: unknown): boolean {
  if (err instanceof LLMError) return false;
  if (err instanceof Error && err.name === "AbortError") return false; // 客户端主动中止
  const cause = (err as { cause?: unknown })?.cause as
    | { code?: string }
    | undefined;
  if (cause?.code) {
    const code = cause.code;
    return (
      code.startsWith("UND_ERR") ||
      ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "EAI_AGAIN"].includes(code)
    );
  }
  return err instanceof TypeError; // “fetch failed” 无 cause 时视为网络错误
}

/**
 * 决定要尝试的端点顺序：
 * - openai：用户填写的 Base URL（默认 https://api.deepseek.com）为主端点；
 *   网络层失败时自动回退官方 api.openai.com
 * - custom：用户填写的 Base URL 为唯一端点（中转/代理用户的主端点）
 */
function openAIEndpoints(opts: LLMCallOpts): string[] {
  const userBase = (opts.baseUrl ?? "").trim().replace(/\/+$/, "");
  if (opts.provider === "custom") {
    return [userBase || DEFAULT_OPENAI_BASE];
  }
  const endpoints = [userBase || DEFAULT_OPENAI_BASE];
  if (userBase && userBase !== DEFAULT_OPENAI_BASE) {
    endpoints.push(DEFAULT_OPENAI_BASE);
  }
  return endpoints;
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
  const body = openAIBody(opts);
  const endpoints = openAIEndpoints(opts);

  for (const base of endpoints) {
    if (unreachableBases.has(base)) {
      continue; // 该端点此前网络失败过，跳过
    }
    try {
      const endpoint = `${base}/chat/completions`;
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
        throw new LLMError(friendlyError(res.status, errText), res.status);
      }
      return parseOpenAIStream(
        res.body as ReadableStream<Uint8Array>,
        opts.onDelta
      );
    } catch (err) {
      if (isNetworkError(err)) {
        unreachableBases.add(base); // 记录失败端点，后续跳过
        continue; // 网络层失败 → 自动切换到下一个端点
      }
      throw wrapNetworkError(err);
    }
  }

  throw new LLMError(
    endpoints.length > 1
      ? "无法连接模型服务：Base URL 与官方端点均连接失败"
      : "无法连接模型服务，请检查网络或 Base URL"
  );
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

// ---------- Anthropic Messages API ----------

const DEFAULT_ANTHROPIC_BASE = "https://api.anthropic.com";

async function streamAnthropic(opts: LLMCallOpts): Promise<LLMResult> {
  const base = (opts.baseUrl || DEFAULT_ANTHROPIC_BASE).replace(/\/+$/, "");
  // max_tokens 是 Anthropic API 的必填项
  const body = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
    stream: true,
    temperature: 0.8,
  };

  let res: Response;
  try {
    res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": opts.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (err) {
    wrapNetworkError(err);
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new LLMError(friendlyError(res.status, errText), res.status);
  }
  return parseAnthropicStream(
    res.body as ReadableStream<Uint8Array>,
    opts.onDelta
  );
}

async function parseAnthropicStream(
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
      try {
        const json = JSON.parse(payload);
        switch (json.type) {
          case "message_start":
            inputTokens = json.message?.usage?.input_tokens ?? inputTokens;
            break;
          case "content_block_delta":
            if (json.delta?.type === "text_delta" && json.delta.text) {
              text += json.delta.text;
              onDelta?.(json.delta.text);
            }
            break;
          case "message_delta":
            outputTokens = json.usage?.output_tokens ?? outputTokens;
            break;
          default:
            break;
        }
      } catch {
        // 忽略无法解析的行
      }
    }
  }
  return { text, inputTokens, outputTokens };
}
