// 共享类型定义

export type Provider = "openai" | "anthropic" | "custom";

export type TargetLang = "zh" | "en";

/** /api/search 的返回结构 */
export interface SearchResult {
  rawText: string;
  sourceUrl: string;
  wordCount: number;
  estimatedCost: number;
  isFallback: boolean;
  /** 搜索失败且用户未提供 API Key，无法降级 LLM 生成 */
  fallbackSkipped?: boolean;
  error?: string;
}

/** /api/process 的输入结构 */
export interface ProcessInput {
  rawText: string;
  style: string;
  needAnalysis: boolean;
  userApiKey: string;
  provider: Provider;
  model: string;
  baseUrl?: string;
  title?: string;
  /** 精修后故事的目标语言（zh / en），默认中文 */
  targetLang?: TargetLang;
}

/** 前端状态机阶段 */
export type Phase =
  | "locked"
  | "ready"
  | "estimating"
  | "estimated"
  | "generating"
  | "done";

// ---- TinyFish 接口返回结构 ----

export interface TinyFishSearchResult {
  position: number;
  site_name: string;
  title: string;
  snippet: string;
  url: string;
}

export interface TinyFishSearchResponse {
  query: string;
  results: TinyFishSearchResult[];
  total_results: number;
  page: number;
}

export interface TinyFishFetchResult {
  url: string;
  final_url: string;
  title: string;
  description: string;
  language: string;
  format: string;
  text: string;
}

export interface TinyFishFetchError {
  url: string;
  error: string;
}

export interface TinyFishFetchResponse {
  results: TinyFishFetchResult[];
  errors: TinyFishFetchError[];
}

// ---- LLM 调用 ----

export interface LLMCallOpts {
  apiKey: string;
  provider: Provider;
  model: string;
  baseUrl?: string;
  system: string;
  user: string;
  maxTokens?: number;
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
}

export interface LLMResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}
