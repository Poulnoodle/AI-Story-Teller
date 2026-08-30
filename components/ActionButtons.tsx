"use client";

// 操作按钮行：① 搜索并估价（灰色） ② 确认并生成（金色，估价确认后才可点击）
// 中间为状态行；密码未解锁时全部置灰

import { useAppState } from "@/hooks/useAppState";

function statusText(state: ReturnType<typeof useAppState>["state"]): {
  text: string;
  isError: boolean;
} {
  if (state.phase === "estimating") return { text: "正在搜索原文…", isError: false };
  if (state.phase === "generating") return { text: "正在生成，请稍候…", isError: false };
  if (state.phase === "done") return { text: "生成完成 ✅", isError: false };
  if (state.phase === "estimated" && state.search) {
    return {
      text: `已找到原文（${state.search.wordCount}字），${
        state.confirmed ? "可点击②生成" : "请在弹窗中确认"
      }`,
      isError: false,
    };
  }
  if (state.error) return { text: `⚠️ ${state.error}`, isError: true };
  return { text: "", isError: false };
}

export default function ActionButtons() {
  const { state, unlocked, btn1Enabled, btn2Enabled, runSearch, runGenerate } =
    useAppState();
  const status = statusText(state);

  return (
    <div className="mt-6 flex flex-wrap items-center gap-4">
      <button
        disabled={!btn1Enabled}
        onClick={runSearch}
        className="px-5 py-2.5 font-serif font-bold border-2 border-gray-400 bg-gray-300 text-gray-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:border-gray-300 disabled:cursor-not-allowed"
      >
        ① 搜索并估价
      </button>
      <button
        disabled={!btn2Enabled}
        onClick={runGenerate}
        className="px-5 py-2.5 font-serif font-bold text-white bg-newspaper-gold hover:bg-[#9a7a24] disabled:bg-[#c9b891] disabled:cursor-not-allowed"
      >
        ② 确认并生成
      </button>
      <span
        className={`font-serif text-sm ${
          status.isError ? "text-red-700 font-bold" : "text-newspaper-ink/80"
        }`}
      >
        {!unlocked ? "🔒 密码错误，全部功能已锁定" : status.text}
      </span>
    </div>
  );
}
