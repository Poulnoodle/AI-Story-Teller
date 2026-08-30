"use client";

// 估价确认弹窗：已找到原文（xxx字），预计消耗 Credits：$0.XX，是否继续？

import { useAppState } from "@/hooks/useAppState";
import { formatUSD } from "@/lib/cost";

export default function CostModal() {
  const { state, confirm, cancelModal } = useAppState();
  if (!state.showModal || !state.search) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-newspaper-bg border-4 border-double border-newspaper-ink p-6 max-w-md w-full shadow-xl">
        <h3 className="font-serif text-xl font-bold text-newspaper-ink">
          📰 号外！原文已找到
        </h3>
        <p className="mt-3 font-serif text-black leading-relaxed">
          已找到原文（{state.search.wordCount}字），预计消耗 Credits：
          {formatUSD(state.search.estimatedCost)}，是否继续？
        </p>
        {state.search.isFallback && (
          <p className="mt-2 text-red-700 font-bold text-sm">
            ⚠️ 该文本由 AI 重构，未经原始文献核实
          </p>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={cancelModal}
            className="px-4 py-2 font-serif border-2 border-newspaper-ink text-newspaper-ink hover:bg-newspaper-ink/10"
          >
            取消
          </button>
          <button
            onClick={confirm}
            className="px-4 py-2 font-serif font-bold text-white bg-newspaper-gold hover:bg-[#9a7a24]"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
