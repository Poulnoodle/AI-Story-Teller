"use client";

// 底部工具栏：实际花费 + 保存按钮（POST /api/save → Blob 下载 .md）

import { useState } from "react";
import { useAppState } from "@/hooks/useAppState";
import { formatUSD } from "@/lib/cost";

export default function Toolbar() {
  const { state } = useAppState();
  const [saving, setSaving] = useState(false);
  const canSave =
    state.phase === "done" &&
    state.processedText.trim().length > 0 &&
    !saving;

  const onSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });
      const data = (await res.json()) as {
        fileName?: string;
        markdownContent?: string;
        error?: string;
      };
      if (!data.markdownContent || !data.fileName) {
        throw new Error(data.error || "保存失败");
      }
      // 前端通过 Blob 执行实际下载
      const blob = new Blob([data.markdownContent], {
        type: "text/markdown;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "保存失败，请重试");
    } finally {
      setSaving(false);
    }
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
