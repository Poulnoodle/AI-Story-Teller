"use client";

// 底部工具栏：实际花费 + 保存按钮（前端内联组装 Markdown → Blob 下载 .md）

import { useAppState } from "@/hooks/useAppState";
import { buildMarkdown } from "@/lib/markdown";
import { formatTimestamp, sanitizeFileName } from "@/lib/utils";
import { formatUSD } from "@/lib/cost";

export default function Toolbar() {
  const { state } = useAppState();
  const canSave =
    state.phase === "done" && state.processedText.trim().length > 0;

  const onSave = () => {
    if (!canSave) return;
    const markdownContent = buildMarkdown({
      title: state.title,
      rawText: state.search?.rawText ?? "",
      processedText: state.processedText,
      analysis: state.analysis,
      meta: {
        sourceUrl: state.search?.sourceUrl ?? "",
        language: state.targetLang,
        style: state.style,
        cost: state.cost,
      },
    });
    const fileName = `${sanitizeFileName(state.title)}_${formatTimestamp(new Date())}.md`;
    // 前端通过 Blob 执行实际下载
    const blob = new Blob([markdownContent], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t-2 border-newspaper-rule pt-4">
      <p className="font-serif text-sm text-newspaper-ink/80">
        {state.phase === "done" && (
          <>
            实际消耗 Credits：<b>{formatUSD(state.cost)}</b>
            <span className="ml-2">· 点击保存将 .md 文件下载到本地</span>
          </>
        )}
      </p>
      <button
        onClick={onSave}
        disabled={!canSave}
        className="px-5 py-2.5 font-serif font-bold border-2 border-newspaper-ink text-newspaper-ink bg-newspaper-bg hover:bg-newspaper-ink hover:text-newspaper-bg disabled:opacity-40 disabled:cursor-not-allowed"
      >
        💾 保存 Markdown (.md)
      </button>
    </div>
  );
}
