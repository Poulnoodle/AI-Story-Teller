"use client";

// 报头：大号艺术字 + 日期线 + 双线分隔

export default function Masthead() {
  const dateStr = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

  return (
    <header className="text-center py-6">
      <h1 className="font-serif text-4xl sm:text-5xl font-bold text-newspaper-ink tracking-wide">
        📰 神话猎手 · THE MYTH HUNTER
      </h1>
      <p className="mt-3 font-serif text-sm text-newspaper-ink/80">
        公元 {dateStr} · 独家报道 · 神话采编部
      </p>
      <div className="double-rule mt-4" />
    </header>
  );
}
