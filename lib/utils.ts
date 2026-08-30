// 通用工具：SSE 流构造、并发池、文件名清洗

export type SSESend = (event: string, data: unknown) => void;

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

/**
 * 构造 SSE 流响应（App Router 风格）。
 * onStart 内可通过 send(event, data) 逐帧写出；抛出的异常会作为 error 事件兜底发送。
 */
export function createSSEStream(
  onStart: (send: SSESend) => void | Promise<void>
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send: SSESend = (event, data) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // 客户端已断开，忽略
        }
      };
      try {
        await onStart(send);
      } catch (err) {
        send("error", {
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        try {
          controller.close();
        } catch {
          // 已关闭
        }
      }
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

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
