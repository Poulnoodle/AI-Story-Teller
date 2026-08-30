// 生成阶段的等待提示文案（ActionButtons 状态行与 OutputPanel 共用）

import type { AppState } from "@/hooks/useAppState";

export function generatingHint(state: AppState): string {
  if (state.phase === "estimating") return "正在搜索原文…";
  if (state.phase !== "generating") return "";
  // 长文本：分段润色阶段给出明确进度
  if (state.meta?.mode === "long" && state.progress) {
    if (state.progress.done < state.progress.total) {
      return `正在润色：第 ${state.progress.done}/${state.progress.total} 段…`;
    }
    return "分段润色完成，正在全局合并…";
  }
  // 首个 token 到达前：明确告知在等待模型响应
  if (!state.processedText) return "正在生成，等待模型响应…";
  return "正在生成…";
}
