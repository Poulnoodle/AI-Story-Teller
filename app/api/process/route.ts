// Step 2 & 3：加工（翻译/润色）+ 解析，SSE 流式返回
// 事件协议：meta / progress / chunk / analysis_chunk / usage / error / done
// 长文本（>8000 CJK 或 >6000 tokens）：分段并发润色 → 缓冲 → 单次流式全局合并

import { NextRequest } from "next/server";
import { completeLLM, LLMError, streamLLM } from "@/lib/llm";
import { needsChunking, splitIntoChunks } from "@/lib/chunking";
import { actualCost } from "@/lib/cost";
import { DEFAULT_MODELS, LONG_MODE_MARKER } from "@/lib/constants";
import {
  createSSEStream,
  runWithConcurrency,
  type SSESend,
} from "@/lib/utils";
import type {
  LLMCallOpts,
  LLMResult,
  ProcessInput,
  Provider,
  TargetLang,
} from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const CHUNK_CONCURRENCY = 3;

function langName(lang?: TargetLang): string {
  return lang === "en" ? "英文" : "中文";
}

function baseLLMOpts(
  body: ProcessInput,
  signal?: AbortSignal
): Omit<LLMCallOpts, "system" | "user"> {
  const provider: Provider = body.provider ?? "openai";
  return {
    apiKey: body.userApiKey,
    provider,
    model: body.model || DEFAULT_MODELS[provider] || "gpt-4o-mini",
    baseUrl: body.baseUrl || undefined,
    signal,
  };
}

/** 每次 LLM 调用结束后推送 usage（前端累加得到实际花费） */
function sendUsage(send: SSESend, result: LLMResult) {
  send("usage", {
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    estimatedCost: actualCost(result.inputTokens, result.outputTokens),
  });
}

/**
 * 加工主流程。chunks 为 null 表示短文本模式（单次流式调用）；
 * 否则为长文本模式：分段并发润色（缓冲，不流式）→ 单次流式合并。
 */
async function processText(
  send: SSESend,
  rawText: string,
  chunks: string[] | null,
  opts: {
    base: Omit<LLMCallOpts, "system" | "user">;
    styleHint: string;
    lang: string;
  }
): Promise<string> {
  const processSystem = `你是一位神话故事编辑。请将下面的神话原文翻译/润色为${opts.lang}${opts.styleHint}的可读故事。保持神话元素与文风，输出纯文本，不要添加任何解释或标记。`;

  // ---- 短文本模式 ----
  if (!chunks) {
    const result = await streamLLM({
      ...opts.base,
      system: processSystem,
      user: rawText,
      maxTokens: 4096,
      onDelta: (delta) => send("chunk", { delta }),
    });
    sendUsage(send, result);
    return result.text;
  }

  // ---- 长文本模式：分段并发润色（结果缓冲，保证顺序） ----
  let completed = 0;
  const chunkResults = await runWithConcurrency(
    chunks,
    CHUNK_CONCURRENCY,
    async (chunk) => {
      const result = await completeLLM({
        ...opts.base,
        system: processSystem,
        user: chunk,
        maxTokens: 4096,
      });
      completed++;
      send("progress", { done: completed, total: chunks.length });
      sendUsage(send, result);
      return result.text;
    }
  );

  // ---- 全局合并与连贯性修复（单次流式调用） ----
  const mergeInput = chunkResults
    .map((t, i) => `【段落 ${i + 1}】\n${t}`)
    .join("\n\n");
  const merged = await streamLLM({
    ...opts.base,
    system:
      "你是一位神话文本总编辑。以下是同一篇神话故事分段润色的结果，请将其合并为连贯流畅的完整故事：修复段落衔接、去除重复内容，不得新增情节或人物。",
    user: `${mergeInput}\n\n请直接输出合并后的完整故事（${opts.lang}），第一行单独写「${LONG_MODE_MARKER}」，其后为故事正文，不要包含任何其他说明。`,
    maxTokens: 8192,
    onDelta: (delta) => send("chunk", { delta }),
  });
  sendUsage(send, merged);
  return merged.text;
}

export async function POST(req: NextRequest) {
  let body: ProcessInput;
  try {
    body = (await req.json()) as ProcessInput;
  } catch {
    return createSSEStream((send) =>
      send("error", { message: "请求体不是合法 JSON" })
    );
  }

  const rawText = (body.rawText ?? "").trim();
  if (!rawText || !body.userApiKey) {
    return createSSEStream((send) =>
      send("error", {
        message: !rawText
          ? "缺少原文（rawText）"
          : "缺少用户 LLM API Key，请填写后重试",
      })
    );
  }

  return createSSEStream(async (send) => {
    try {
      const base = baseLLMOpts(body, req.signal);
      const style = (body.style ?? "").trim();
      const lang = langName(body.targetLang);
      const styleHint = style ? `，采用「${style}」风格` : "";

      const longMode = needsChunking(rawText);
      const chunks = longMode ? splitIntoChunks(rawText) : null;
      send("meta", {
        mode: longMode ? "long" : "normal",
        chunks: chunks?.length,
        title: body.title ?? "",
      });

      const processedText = await processText(send, rawText, chunks, {
        base,
        styleHint,
        lang,
      });

      if (body.needAnalysis) {
        const analysis = await streamLLM({
          ...base,
          system: "你是一位神话学分析专家。",
          user: `请从主题、人物与意象、文化背景与寓意三个方面解析下面这则神话，用${lang}输出，500字以内。\n\n${processedText}`,
          maxTokens: 1500,
          onDelta: (delta) => send("analysis_chunk", { delta }),
        });
        sendUsage(send, analysis);
      }

      send("done", {});
    } catch (err) {
      send("error", {
        message:
          err instanceof LLMError
            ? err.message
            : err instanceof Error
              ? err.message
              : "处理失败，请重试",
      });
    }
  });
}
