// Step 1：搜索神话故事原文（TinyFish 搜索 + 抓取）
// 降级策略：3 次尝试（每次换查询词 + 换候选 URL 批次）全部失败后，
// 调用用户 LLM 生成已知梗概，并用 [⚠️ AI 重构，未经原始文献核实] 强制标记包裹。

import { NextRequest, NextResponse } from "next/server";
import {
  cleanExtractedText,
  fetchTinyFish,
  searchTinyFish,
} from "@/lib/tinyfish";
import { completeLLM, LLMError } from "@/lib/llm";
import { countCJK, countLatinWords, estimateSearchCost } from "@/lib/cost";
import { DEFAULT_MODELS, FALLBACK_MARKER } from "@/lib/constants";
import type {
  Provider,
  SearchResult,
  TargetLang,
  TinyFishSearchResult,
} from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MIN_USABLE_CHARS = 100;
const CANDIDATES_PER_ATTEMPT = 3;
const MAX_ATTEMPTS = 3;

interface SearchRequestBody {
  title: string;
  targetLang?: TargetLang;
  userApiKey?: string;
  provider?: Provider;
  model?: string;
  baseUrl?: string;
}

/** 三次尝试的查询词递进 */
function attemptQueries(title: string, lang: TargetLang): string[] {
  if (lang === "en") {
    return [
      `${title} original text`,
      `${title} myth full text`,
      `${title}`,
    ];
  }
  return [`${title} 原文`, `${title} 神话 全文`, `${title}`];
}

/** 把标题拆成检索词（用于候选评分） */
function titleTokens(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[\s,，。·、;；:：]+/)
    .filter((t) => t.length >= 2);
}

/** 候选命中标题关键词越多越优先（排序稳定，同分保持原始顺序） */
function scoreCandidate(tokens: string[], cand: TinyFishSearchResult): number {
  const haystack = `${cand.title} ${cand.snippet}`.toLowerCase();
  return tokens.reduce((score, t) => score + (haystack.includes(t) ? 1 : 0), 0);
}

function emptyResult(extra: Partial<SearchResult>): NextResponse {
  return NextResponse.json({
    rawText: "",
    sourceUrl: "",
    wordCount: 0,
    estimatedCost: 0,
    isFallback: false,
    ...extra,
  });
}

export async function POST(req: NextRequest) {
  let body: SearchRequestBody;
  try {
    body = (await req.json()) as SearchRequestBody;
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const title = (body.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "标题不能为空" }, { status: 400 });
  }
  const targetLang: TargetLang = body.targetLang === "en" ? "en" : "zh";
  const provider: Provider = body.provider ?? "openai";
  const model = body.model || DEFAULT_MODELS[provider] || "gpt-4o-mini";

  const queries = attemptQueries(title, targetLang);
  const tokens = titleTokens(title);
  const attempted = new Set<string>(); // 明确失败（空/太短/单 URL 报错）的 URL，不再复用
  const timeoutCount = new Map<string, number>(); // 超时计数：允许复用一次

  let best: { text: string; url: string } | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS && !best; attempt++) {
    let results;
    try {
      results = await searchTinyFish(queries[attempt], {
        purpose: `寻找神话故事《${title}》的原文全文，用于文学加工`,
      });
    } catch {
      continue; // 本次搜索失败，进入下一查询词
    }

    const candidates = (results.results ?? [])
      .filter(
        (r) =>
          r?.url &&
          !attempted.has(r.url) &&
          (timeoutCount.get(r.url) ?? 0) < 2
      )
      .sort((a, b) => scoreCandidate(tokens, b) - scoreCandidate(tokens, a))
      .slice(0, CANDIDATES_PER_ATTEMPT);

    if (candidates.length === 0) continue;

    let fetched;
    try {
      fetched = await fetchTinyFish(candidates.map((c) => c.url));
    } catch {
      // 整批超时/失败：计一次超时，允许下轮复用一次
      for (const c of candidates) {
        timeoutCount.set(c.url, (timeoutCount.get(c.url) ?? 0) + 1);
      }
      continue;
    }

    for (const cand of candidates) {
      const item = fetched.results.find((r) => r.url === cand.url);
      const errItem = fetched.errors?.find((e) => e.url === cand.url);
      if (!item || errItem) {
        attempted.add(cand.url);
        continue;
      }
      const cleaned = cleanExtractedText(item.text ?? "");
      if (cleaned.length < MIN_USABLE_CHARS) {
        attempted.add(cand.url);
        continue;
      }
      best = { text: cleaned, url: cand.url };
      break;
    }
  }

  // ---- 3 次失败后降级：LLM 生成概要（不报错） ----
  if (!best) {
    if (!body.userApiKey) {
      return emptyResult({
        fallbackSkipped: true,
        error: "搜索失败且未提供 API Key，请填写后重试",
      });
    }
    try {
      const summary = await completeLLM({
        apiKey: body.userApiKey,
        provider,
        model,
        baseUrl: body.baseUrl || undefined,
        system: "你是一位神话学专家。",
        user: `请用${targetLang === "zh" ? "中文" : "English"}写出神话《${title}》的权威概要（人物、情节、背景），约500字。`,
        maxTokens: 1000,
      });
      const wrapped = `${FALLBACK_MARKER}\n\n${summary.text.trim()}\n\n${FALLBACK_MARKER}`;
      const result: SearchResult = {
        rawText: wrapped,
        sourceUrl: "AI 重构（未经原始文献核实）",
        wordCount: countCJK(wrapped) + countLatinWords(wrapped),
        estimatedCost: estimateSearchCost(wrapped.length),
        isFallback: true,
      };
      return NextResponse.json(result);
    } catch (err) {
      return emptyResult({
        isFallback: true,
        error:
          err instanceof LLMError
            ? `降级生成失败：${err.message}`
            : "降级生成失败，请稍后重试",
      });
    }
  }

  const result: SearchResult = {
    rawText: best.text,
    sourceUrl: best.url,
    wordCount: countCJK(best.text) + countLatinWords(best.text),
    estimatedCost: estimateSearchCost(best.text.length),
    isFallback: false,
  };
  return NextResponse.json(result);
}
