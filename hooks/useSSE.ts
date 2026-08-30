// SSE 消费：fetch + ReadableStream 逐帧解析（与服务端 createSSEStream 对应）

export interface SSEHandlers {
  onEvent: (event: string, data: Record<string, unknown>) => void;
  signal?: AbortSignal;
}

export async function postSSE(
  url: string,
  body: unknown,
  handlers: SSEHandlers
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: handlers.signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      let event = "message";
      const dataLines: string[] = [];
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length === 0) continue;
      try {
        handlers.onEvent(
          event,
          JSON.parse(dataLines.join("\n")) as Record<string, unknown>
        );
      } catch {
        // 忽略无法解析的帧
      }
    }
  }
}
