// TinyFish 联网搜索封装（仅后端使用，绝不暴露给前端）
// 认证：所有请求携带 X-API-Key: <TINYFISH_API_KEY> 头
// 搜索与抓取均免费（不从钱包扣费）

import type {
  TinyFishFetchResponse,
  TinyFishSearchResponse,
} from "./types";

const SEARCH_ENDPOINT = "https://api.search.tinyfish.ai";
const FETCH_ENDPOINT = "https://api.fetch.tinyfish.ai";

const SEARCH_TIMEOUT_MS = 15000;
const FETCH_TIMEOUT_MS = 20000;

export class TinyFishError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TinyFishError";
  }
}

/** 为 Promise 加超时（AbortController 实现） */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new TinyFishError(`请求超时（${ms / 1000}s）`)),
      ms
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

/** 调用 TinyFish 搜索接口，返回结构化结果（标题/摘要/URL） */
export async function searchTinyFish(
  query: string,
  opts: { purpose?: string; language?: string } = {}
): Promise<TinyFishSearchResponse> {
  const key = process.env.TINYFISH_API_KEY;
  if (!key) throw new TinyFishError("缺少 TINYFISH_API_KEY 环境变量");

  const params = new URLSearchParams({ query, domain_type: "web" });
  if (opts.purpose) params.set("purpose", opts.purpose);
  if (opts.language) params.set("language", opts.language);

  const res = await withTimeout(
    fetch(`${SEARCH_ENDPOINT}?${params.toString()}`, {
      headers: { "X-API-Key": key },
      cache: "no-store",
    }),
    SEARCH_TIMEOUT_MS
  );
  if (!res.ok) {
    throw new TinyFishError(`TinyFish 搜索失败（HTTP ${res.status}）`);
  }
  return (await res.json()) as TinyFishSearchResponse;
}

/** 调用 TinyFish 抓取接口，返回清洗后的网页正文（markdown） */
export async function fetchTinyFish(
  urls: string[]
): Promise<TinyFishFetchResponse> {
  const key = process.env.TINYFISH_API_KEY;
  if (!key) throw new TinyFishError("缺少 TINYFISH_API_KEY 环境变量");

  const res = await withTimeout(
    fetch(FETCH_ENDPOINT, {
      method: "POST",
      headers: { "X-API-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ urls: urls.slice(0, 10), format: "markdown", ttl: 0 }),
      cache: "no-store",
    }),
    FETCH_TIMEOUT_MS
  );
  if (!res.ok) {
    throw new TinyFishError(`TinyFish 抓取失败（HTTP ${res.status}）`);
  }
  // 注意：单 URL 失败会以 200 + errors[] 返回，必须同时检查两个数组
  return (await res.json()) as TinyFishFetchResponse;
}

const BOILERPLATE_PATTERNS: RegExp[] = [
  /^(阅读更多|查看更多|点击阅读全文|点击展开|展开全文|广告|相关推荐|猜你喜欢|热门推荐|免责声明|版权声明).*$/,
  /^(Skip to content|Read more|Related articles|Advertisement|Subscribe|Sign up|Log in).*$/i,
  /^.*(登录|注册|cookie|cookies|隐私政策|隐私条款|用户协议).*$/i,
];

const MAX_TEXT_LENGTH = 60000;

/** 清洗抓取到的正文：去导航/广告等样板行、合并空行、超长截断 */
export function cleanExtractedText(text: string): string {
  let out = text
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 && !BOILERPLATE_PATTERNS.some((re) => re.test(line))
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (out.length > MAX_TEXT_LENGTH) {
    out = out.slice(0, MAX_TEXT_LENGTH) + "\n\n[…已截断]";
  }
  return out;
}
