"use client";

// 加载转圈标识（报纸墨色）

export default function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 border-2 border-newspaper-ink/30 border-t-newspaper-ink rounded-full animate-spin align-middle ${className}`}
      aria-label="加载中"
      role="status"
    />
  );
}
