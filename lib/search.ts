// Step 1：搜索神话故事原文（TinyFish 搜索 + 抓取，浏览器直连）
// 降级策略：3 次尝试（每次换查询词 + 换候选 URL 批次）全部失败后，
// 调用用户 LLM 生成已知梗概，并用 [⚠️ AI 重构，未经原始文献核实] 强制标记包裹。

import {
  cleanExtractedText,
  fetchTinyFish,
  isUsableExtract,
  searchTinyFish,
} from "./tinyfish";
import { completeLLM, LLMError } from "./llm";
import { countCJK, countLatinWords, estimateSearchCost } from "./cost";
import {
  BOOSTED_DOMAINS,
  DEFAULT_MODELS,
  FALLBACK_MARKER,
  PREFERRED_DOMAINS,
  PREFERRED_SITES,
} from "./constants";
import type {
  Provider,
  SearchResult,
  TargetLang,
  TinyFishSearchResult,
} from "./types";

const CANDIDATES_PER_ATTEMPT = 3;
const MAX_ATTEMPTS = 3;

export interface SearchParams {
  title: string;
  targetLang?: TargetLang;
  userApiKey?: string;
  provider?: Provider;
  model?: string;
  baseUrl?: string;
}

/**
 * 三次尝试的查询词递进：
 * 第 1 次用裸标题（仅限优先站点内搜索）；第 2、3 次加限定词（全网搜索）
 */
function attemptQueries(title: string, lang: TargetLang): string[] {
  if (lang === "en") {
    return [title, `${title} original text`, `${title} myth full text`];
  }
  return [title, `${title} 原文`, `${title} 神话 全文`];
}

/** 提取域名（去掉 www. 前缀） */
function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** 域名加权：优先站 +2，维基百科（wikiwand 镜像同族）+1 */
function domainBoost(url: string): number {
  const d = domainOf(url);
  if (!d) return 0;
  if (PREFERRED_SITES.some((s) => d === s.domain || d.endsWith("." + s.domain))) {
    return 2;
  }
  if (BOOSTED_DOMAINS.some((s) => d === s || d.endsWith("." + s))) {
    return 1;
  }
  return 0;
}

/** 英文停用词（含泛神话词，避免相关性判定过弱） */
const EN_STOPWORDS = new Set([
  "the", "of", "and", "or", "a", "an", "in", "on", "to", "is", "are", "was",
  "were", "with", "by", "for", "at", "from", "that", "this", "it", "as",
  "be", "he", "she", "they", "myth", "mythos", "mythology", "story",
  "stories", "legend", "legends",
]);

/**
 * 把标题拆成检索词（用于候选评分与相关性门禁）。
 * CJK 整词附加 2 字 n-gram（如「雷神托尔」→ 雷神/神托/托尔），英文过滤停用词。
 * 返回 { full: 整词, all: 整词 + n-gram }。
 */
function titleTokens(title: string): { full: string[]; all: string[] } {
  const parts = title
    .toLowerCase()
    .split(/[\s,，。·、;；:：!?！？"'“”‘’()（）\[\]]+/)
    .filter(Boolean);
  const full: string[] = [];
  const all: string[] = [];
  for (const p of parts) {
    if (/^[一-鿿]+$/.test(p)) {
      full.push(p);
      all.push(p);
      if (p.length >= 4) {
        for (let i = 0; i + 2 <= p.length; i++) all.push(p.slice(i, i + 2));
      }
    } else if (/^[a-z0-9]+$/.test(p)) {
      if (!EN_STOPWORDS.has(p) && p.length >= 2) {
        full.push(p);
        all.push(p);
      }
    } else if (p.length >= 2) {
      full.push(p);
      all.push(p);
    }
  }
  return { full, all };
}

/** 统计文本中所有检索词的累计命中次数 */
function countHits(text: string, tokens: string[]): number {
  const lower = text.toLowerCase();
  let hits = 0;
  for (const t of tokens) {
    hits += lower.split(t.toLowerCase()).length - 1;
  }
  return hits;
}

/** 候选命中标题关键词越多越优先（排序稳定，同分保持原始顺序） */
function scoreCandidate(tokens: string[], cand: TinyFishSearchResult): number {
  const haystack = `${cand.title} ${cand.snippet}`.toLowerCase();
  return tokens.reduce((score, t) => score + (haystack.includes(t) ? 1 : 0), 0);
}

function emptyResult(extra: Partial<SearchResult>): SearchResult {
  return {
    rawText: "",
    sourceUrl: "",
    wordCount: 0,
    estimatedCost: 0,
    isFallback: false,
    ...extra,
  };
}

/**
 * 搜索神话原文（浏览器直连 TinyFish），失败时降级为用户 LLM 生成概要。
 * 返回结构与原 /api/search 的 JSON 契约完全一致。
 */
export async function searchForStory(params: SearchParams): Promise<SearchResult> {
  const title = (params.title ?? "").trim();
  if (!title) {
    return emptyResult({ error: "标题不能为空" });
  }
  const targetLang: TargetLang = params.targetLang === "en" ? "en" : "zh";
  const provider: Provider = params.provider ?? "openai";
  const model = params.model || DEFAULT_MODELS[provider] || "gpt-4o-mini";

  const queries = attemptQueries(title, targetLang);
  const { full: fullTokens, all: allTokens } = titleTokens(title);
  const attempted = new Set<string>(); // 明确失败（空/太短/单 URL 报错）的 URL，不再复用
  const timeoutCount = new Map<string, number>(); // 超时计数：允许复用一次

  let best: { text: string; url: string } | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS && !best; attempt++) {
    let results;
    try {
      results = await searchTinyFish(queries[attempt], {
        purpose: `寻找神话故事《${title}》的原文全文，用于文学加工`,
        // 第一次尝试只在优先神话站点内搜索，保证原文质量
        includeDomains: attempt === 0 ? PREFERRED_DOMAINS : undefined,
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
      // 域名层级优先：优先站 > 维基百科 > 其他；同层内按关键词命中排序。
      // 避免「论坛摘要命中多次标题词」把优质百科/故事站挤出抓取名单。
      .sort((a, b) => {
        const da = domainBoost(a.url);
        const db = domainBoost(b.url);
        if (da !== db) return db - da;
        return scoreCandidate(allTokens, b) - scoreCandidate(allTokens, a);
      })
      .slice(0, CANDIDATES_PER_ATTEMPT);

    if (candidates.length === 0) continue;

    console.log(
      `[search] attempt=${attempt} query="${queries[attempt]}" scope=${attempt === 0 ? "preferred" : "general"} 候选: ${candidates
        .map((c) => `${c.url} (score=${scoreCandidate(allTokens, c) + domainBoost(c.url)})`)
        .join(" | ")}`
    );

    // 相关性门禁：候选的标题/摘要必须命中至少一个标题检索词，否则跳过抓取
    if (!candidates.some((c) => scoreCandidate(allTokens, c) > 0)) continue;

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
      const fullHits = countHits(cleaned, fullTokens);
      const allHits = countHits(cleaned, allTokens);
      if (!isUsableExtract(cleaned)) {
        console.log(`[search] 拒绝 ${cand.url}: 形态不可用(len=${cleaned.length})`);
        attempted.add(cand.url);
        continue;
      }
      // 正文级相关性：标题整词 ≥3 次命中，或含 n-gram 的累计命中 ≥5 次
      // （防止候选标题/摘要命中、但正文是无关列表/导航页、仅侧栏提一次标题的情况）
      if (fullHits < 3 && allHits < 5) {
        console.log(`[search] 拒绝 ${cand.url}: 命中不足 full=${fullHits} all=${allHits}`);
        attempted.add(cand.url);
        continue;
      }
      console.log(`[search] 采用 ${cand.url}: full=${fullHits} all=${allHits} len=${cleaned.length}`);
      best = { text: cleaned, url: cand.url };
      break;
    }
  }

  // ---- 3 次失败后降级：LLM 生成概要（不报错） ----
  if (!best) {
    if (!params.userApiKey) {
      return emptyResult({
        fallbackSkipped: true,
        error: "搜索失败且未提供 API Key，请填写后重试",
      });
    }
    try {
      const summary = await completeLLM({
        apiKey: params.userApiKey,
        provider,
        model,
        baseUrl: params.baseUrl || undefined,
        system: "你是一位神话学专家。",
        user: `请用${targetLang === "zh" ? "中文" : "English"}写出神话《${title}》的权威概要（人物、情节、背景），约500字。`,
        maxTokens: 1000,
      });
      const wrapped = `${FALLBACK_MARKER}\n\n${summary.text.trim()}\n\n${FALLBACK_MARKER}`;
      return {
        rawText: wrapped,
        sourceUrl: "AI 重构（未经原始文献核实）",
        wordCount: countCJK(wrapped) + countLatinWords(wrapped),
        estimatedCost: estimateSearchCost(wrapped.length),
        isFallback: true,
      };
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

  return {
    rawText: best.text,
    sourceUrl: best.url,
    wordCount: countCJK(best.text) + countLatinWords(best.text),
    estimatedCost: estimateSearchCost(best.text.length),
    isFallback: false,
  };
}
