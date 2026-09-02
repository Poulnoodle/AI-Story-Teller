// TinyFish 联网搜索封装（浏览器直连，接口允许 CORS）
// 认证：所有请求携带 X-API-Key: <NEXT_PUBLIC_TINYFISH_API_KEY> 头
// 注意：该密钥构建期内联进公开 JS 包，任何人可见 —— 请使用专用低权限密钥
// 搜索与抓取均免费（不从钱包扣费）

import { countCJK, countLatinWords } from "./cost";
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
  opts: {
    purpose?: string;
    language?: string;
    /** 限定只在这些域名内搜索（逗号分隔） */
    includeDomains?: string;
  } = {}
): Promise<TinyFishSearchResponse> {
  const key = process.env.NEXT_PUBLIC_TINYFISH_API_KEY;
  if (!key) throw new TinyFishError("缺少 NEXT_PUBLIC_TINYFISH_API_KEY（构建时未注入）");

  const params = new URLSearchParams({ query, domain_type: "web" });
  if (opts.purpose) params.set("purpose", opts.purpose);
  if (opts.language) params.set("language", opts.language);
  if (opts.includeDomains) params.set("include_domains", opts.includeDomains);

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
  const key = process.env.NEXT_PUBLIC_TINYFISH_API_KEY;
  if (!key) throw new TinyFishError("缺少 NEXT_PUBLIC_TINYFISH_API_KEY（构建时未注入）");

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
  // 社交平台登录墙 / 互动模板噪声
  /^(Email or phone number|Password|Forgot password\?|Forgot Account\?|Create new account|Sign Up)$/i,
  /^(Like|Comment|Share|Comments|No comments yet|Be the first to comment)$/i,
  /^(Verified account|Shared with Public|See more on Facebook|Follow)$/i,
  /^All reactions:.*$/i,
  // 论坛/帖子噪声
  /^\d+\s*(y|mo|d|h|min)\s*ago$/i, // 1y ago / 2 mo ago
  /^(Archived post.*|Best comments?|Open comment sort options|# Comments Section)$/i,
  /^r\/[A-Za-z0-9_]+$/,
  /^(Ad|Advertisement|Sponsored|Promoted|Learn More)$/i,
  // 维基百科横幅/表格噪声
  /^(维基百科，自由的百科全书|關於.*，請見.*|关于.*，请见.*)$/,
  /^(此條目需要补充更多来源.*|此条目需要补充更多来源.*|请协助補充多方面可靠来源.*|致使用者：请搜索一下条目的标题.*)$/,
  /^[\s|—\-]+$/, // 表格边框行
  /^\d+$/, // 纯数字行
  /^·$/, // 分隔符行
];

const MAX_TEXT_LENGTH = 60000;

/**
 * 抓取结果是否可用：长度达标、包含足够多的实质内容（汉字或单词）、
 * 且形态像正文（平均行长足够 + 至少一行 ≥80 字符的段落），
 * 用于排除登录墙与视频列表页等噪声。
 */
export function isUsableExtract(text: string): boolean {
  const MIN_CHARS = 100;
  const MIN_CJK = 100;
  const MIN_WORDS = 50;
  const MIN_AVG_LINE = 20;
  const PROSE_LINE = 40;

  if (
    text.length < MIN_CHARS ||
    (countCJK(text) < MIN_CJK && countLatinWords(text) < MIN_WORDS)
  ) {
    return false;
  }
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return false;
  const avgLine = text.length / lines.length;
  return avgLine >= MIN_AVG_LINE && lines.some((l) => l.length >= PROSE_LINE);
}

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
