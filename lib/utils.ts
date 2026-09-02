// 通用工具：并发池、文件名清洗

/** 简单并发池：以 limit 个 worker 并发执行 fn，结果按输入顺序返回 */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) break;
        results[i] = await fn(items[i], i);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

/** 把标题清洗为安全的文件名（保留中文，去掉路径危险字符） */
export function sanitizeFileName(title: string): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/[\s　]+/g, "-")
    .slice(0, 80)
    .trim();
  return cleaned || "story";
}

/** 生成文件名时间戳，如 2026-08-31-06-30 */
export function formatTimestamp(date: Date): string {
  return date.toISOString().replace(/[:T]/g, "-").slice(0, 16);
}
