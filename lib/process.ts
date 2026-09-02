// Step 2 & 3：加工（翻译/润色）+ 解析，浏览器直连流式执行
// 事件协议（进程内回调，等价于原 /api/process 的 SSE 协议）：
// meta / progress / chunk / analysis_chunk / usage / error / done
// 长文本（>8000 CJK 或 >6000 tokens）：分段并发润色 → 缓冲 → 单次流式全局合并

import { completeLLM, LLMError, streamLLM } from "./llm";
import { needsChunking, splitIntoChunks } from "./chunking";
import { actualCost } from "./cost";
import { DEFAULT_MODELS, LONG_MODE_MARKER } from "./constants";
import { runWithConcurrency } from "./utils";
import type {
  LLMCallOpts,
  LLMResult,
  ProcessInput,
  Provider,
  TargetLang,
} from "./types";

export type ProcessEvent =
  | "meta"
  | "progress"
  | "chunk"
  | "analysis_chunk"
  | "usage"
  | "error"
  | "done";

/** 各事件载荷结构（等价于原 /api/process SSE 的 data JSON） */
export interface ProcessEventMap {
  meta: { mode: "normal" | "long"; chunks?: number; title?: string };
  progress: { done: number; total: number };
  chunk: { delta: string };
  analysis_chunk: { delta: string };
  usage: { inputTokens: number; outputTokens: number; estimatedCost: number };
  error: { message: string };
  done: Record<string, never>;
}

/** 关联类型的事件发射器：event 与 data 载荷一一对应，编译期兜底 */
export type Emit = <K extends ProcessEvent>(
  event: K,
  data: ProcessEventMap[K]
) => void;

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
function sendUsage(emit: Emit, result: LLMResult) {
  emit("usage", {
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
  emit: Emit,
  rawText: string,
  chunks: string[] | null,
  opts: {
    base: Omit<LLMCallOpts, "system" | "user">;
    styleHint: string;
    lang: string;
  }
): Promise<string> {
  const processSystem = `你是一位神话故事编辑与作家。请基于用户提供的资料，创作一篇连贯、完整的${opts.lang}神话故事${opts.styleHint}。

创作要求：
1. 提炼资料中该神话的核心情节、人物与意象。如果资料是论坛讨论、评论、问答或百科条目而非故事本身，请依据其中的信息重新创作出完整的故事；资料缺失的细节可基于该神话的常见版本合理补全。
2. 剔除用户名、时间戳、网站导航、广告、投票提示等一切与故事无关的内容，绝不照抄资料的段落结构或原样复述。
3. 按「背景 → 情节 → 结局」的顺序叙述，使用优美流畅的文学语言。
4. 只输出故事正文本身，不要任何解释、标题、注释或标记。`;

  // ---- 短文本模式 ----
  if (!chunks) {
    const result = await streamLLM({
      ...opts.base,
      system: processSystem,
      user: rawText,
      maxTokens: 4096,
      onDelta: (delta) => emit("chunk", { delta }),
    });
    sendUsage(emit, result);
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
      emit("progress", { done: completed, total: chunks.length });
      sendUsage(emit, result);
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
    onDelta: (delta) => emit("chunk", { delta }),
  });
  sendUsage(emit, merged);
  return merged.text;
}

/**
 * 执行完整加工流程（浏览器直连）。
 * 事件契约：
 * - 校验失败 / LLM 业务错误（HTTP 状态码，如 401/429）→ emit("error") 后正常 resolve
 * - 传输层失败（断网 / 浏览器节流 / 用户中止）→ 原样抛出，由调用方决定重试
 */
export async function runProcessFlow(
  body: ProcessInput,
  opts: { signal?: AbortSignal; emit: Emit }
): Promise<void> {
  const { signal, emit } = opts;

  const rawText = (body.rawText ?? "").trim();
  if (!rawText || !body.userApiKey) {
    emit("error", {
      message: !rawText
        ? "缺少原文（rawText）"
        : "缺少用户 LLM API Key，请填写后重试",
    });
    return;
  }

  try {
    if (signal?.aborted) throw new DOMException("已中止", "AbortError");
    const base = baseLLMOpts(body, signal);
    const style = (body.style ?? "").trim();
    const lang = langName(body.targetLang);
    const styleHint = style ? `，采用「${style}」风格` : "";

    const longMode = needsChunking(rawText);
    const chunks = longMode ? splitIntoChunks(rawText) : null;
    console.log(
      `[process] 开始: mode=${longMode ? "long" : "normal"} rawText=${rawText.length}字 chunks=${chunks?.length ?? 0} provider=${body.provider} model=${body.model} needAnalysis=${body.needAnalysis}`
    );
    emit("meta", {
      mode: longMode ? "long" : "normal",
      chunks: chunks?.length,
      title: body.title ?? "",
    });

    const processedText = await processText(emit, rawText, chunks, {
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
        onDelta: (delta) => emit("analysis_chunk", { delta }),
      });
      sendUsage(emit, analysis);
    }

    console.log(`[process] 完成: processedText=${processedText.length}字 analysis=${body.needAnalysis ? "已生成" : "未勾选"}`);
    emit("done", {});
  } catch (err) {
    if (err instanceof LLMError) {
      console.error(`[process] 失败: ${err.message}`);
      emit("error", { message: err.message });
      return;
    }
    // 传输层失败（fetch TypeError / AbortError / DOMException）向上抛出，
    // 由 useAppState 的既有重试逻辑处理（与原先浏览器↔服务端断线语义一致）
    console.error(`[process] 传输失败: ${err instanceof Error ? err.message : err}`);
    throw err;
  }
}
