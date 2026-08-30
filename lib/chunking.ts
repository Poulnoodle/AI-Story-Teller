// 长文本分块策略
// 阈值：> 8000 个 CJK 汉字 或 > 6000 tokens 触发分块
// 单块最大 2500 字符 —— 控制单次 LLM 调用时长，稳定适配 Vercel Hobby 60s 限制

import { countCJK, estimateTokens } from "./cost";

export const LONG_TEXT_CJK_THRESHOLD = 8000;
export const LONG_TEXT_TOKEN_THRESHOLD = 6000;
export const MAX_CHUNK_CHARS = 2500;

/** 判断是否需要对 rawText 分块处理 */
export function needsChunking(text: string): boolean {
  return (
    estimateTokens(text) > LONG_TEXT_TOKEN_THRESHOLD ||
    countCJK(text) > LONG_TEXT_CJK_THRESHOLD
  );
}

/** 按句子边界切分（不吞掉标点） */
const SENTENCE_SPLIT = /(?<=[。！？.!?])/;

const startsWithLatin = (s: string) => /^[A-Za-z0-9]/.test(s);
const endsWithLatin = (s: string) => /[A-Za-z0-9]$/.test(s);

/**
 * 按段落拆分并贪心打包为不超过 maxChars 的块。
 * 超长段落先按句子边界硬切；单句仍超长则直接按长度硬切。
 */
export function splitIntoChunks(
  text: string,
  maxChars: number = MAX_CHUNK_CHARS
): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  const append = (part: string) => {
    // 超长段落：先按句子边界切分
    if (part.length > maxChars) {
      flush();
      const sentences = part.split(SENTENCE_SPLIT);
      for (const s of sentences) {
        if (!s.trim()) continue;
        // 单句仍超长：直接按长度硬切
        if (s.length > maxChars) {
          flush();
          for (let i = 0; i < s.length; i += maxChars) {
            chunks.push(s.slice(i, i + maxChars).trim());
          }
          continue;
        }
        if (current && current.length + s.length > maxChars) flush();
        const sep =
          startsWithLatin(s) && endsWithLatin(current) ? " " : "";
        current += sep + s;
      }
      return;
    }
    if (current && current.length + part.length > maxChars) flush();
    current += (current ? "\n\n" : "") + part;
  };

  for (const p of paragraphs) append(p);
  flush();
  return chunks;
}
