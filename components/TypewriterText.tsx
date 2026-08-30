"use client";

// 打字机效果：流式文本到达后以约 30ms/6 字 逐字揭示；
// 生成结束（active=false）时立即跳到全文。父组件用 key={genId} 重置。

import { useEffect, useState } from "react";

const STEP = 6;
const SPEED_MS = 30;

export default function TypewriterText({
  full,
  active,
}: {
  full: string;
  active: boolean;
}) {
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    if (!active) {
      setVisible(full.length);
      return;
    }
    const timer = setInterval(() => {
      setVisible((v) => Math.min(v + STEP, full.length));
    }, SPEED_MS);
    return () => clearInterval(timer);
  }, [active, full.length]);

  return (
    <p className="whitespace-pre-wrap leading-relaxed text-black">
      {full.slice(0, Math.min(visible, full.length))}
      {active && visible < full.length && (
        <span className="animate-pulse text-newspaper-ink">▌</span>
      )}
    </p>
  );
}
