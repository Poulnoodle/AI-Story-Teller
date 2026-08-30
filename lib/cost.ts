// 字数统计与费用估算
// 估算口径（启发式，文档化）：CJK 字符 ≈ 1 token；英文单词 ≈ 1.3 token；标点 ≈ 0.5 token

const CJK_RANGES: [number, number][] = [
  [0x4e00, 0x9fff], // CJK 统一表意文字
  [0x3400, 0x4dbf], // CJK 扩展 A
  [0xf900, 0xfaff], // CJK 兼容表意文字
];

const isCJK = (ch: string): boolean => {
  const code = ch.codePointAt(0) ?? 0;
  return CJK_RANGES.some(([lo, hi]) => code >= lo && code <= hi);
};

/** 统计文本中的 CJK 汉字数 */
export function countCJK(text: string): number {
  let count = 0;
  for (const ch of text) {
    if (isCJK(ch)) count++;
  }
  return count;
}

/** 统计拉丁字母单词数 */
export function countLatinWords(text: string): number {
  const matches = text.match(/[A-Za-z]+(?:[''-][A-Za-z]+)*/g);
  return matches ? matches.length : 0;
}

/** 估算 token 数（启发式） */
export function estimateTokens(text: string): number {
  const cjk = countCJK(text);
  const nonCjk = text.replace(/[㐀-鿿豈-﫿]/g, " ");
  const words = countLatinWords(nonCjk);
  const punctuation =
    (nonCjk.match(/[，。！？；：、,.!?;:()[\]{}"'“”‘’]/g) || []).length;
  return Math.ceil(cjk + words * 1.3 + punctuation / 2);
}

/**
 * 搜索阶段的预估费用（规格书公式）：
 * 预估价格 = (rawText 字数 / 1000 * 0.002) * 3 个步骤
 */
export function estimateSearchCost(charCount: number): number {
  return Math.round(((charCount / 1000) * 0.002 * 3) * 10000) / 10000;
}

/** 按实际 token 用量估算单次 LLM 调用费用（与规格书同价） */
export function actualCost(inputTokens: number, outputTokens: number): number {
  return (
    Math.round((((inputTokens + outputTokens) / 1000) * 0.002) * 10000) / 10000
  );
}

/** 美元小数格式化，如 $0.0480 */
export function formatUSD(n: number): string {
  return `$${n.toFixed(4)}`;
}
