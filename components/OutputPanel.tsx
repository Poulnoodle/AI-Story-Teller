"use client";

// 输出面板（仿报纸专栏，带分割线）：
// 左列 = 精修故事（打字机流式渲染）；右列 = 神话解析（折叠面板，勾选后展示）
// 安全：所有 LLM 文本一律纯文本渲染（whitespace-pre-wrap），绝不使用 dangerouslySetInnerHTML

import { useAppState } from "@/hooks/useAppState";
import TypewriterText from "./TypewriterText";

export default function OutputPanel() {
  const { state } = useAppState();
  const showStory = state.phase === "generating" || state.phase === "done";
  const showAnalysis = state.needAnalysis && state.analysis.length > 0;

  return (
    <section className="mt-8 border-2 border-newspaper-rule bg-white/40">
      <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-newspaper-rule min-h-[240px]">
        {/* 左列：精修故事 */}
        <div className="p-4">
          <h2 className="font-serif text-lg font-bold text-newspaper-ink border-b-2 border-newspaper-rule pb-2 mb-3">
            ✨ 精修故事
          </h2>
          {state.phase === "estimating" && (
            <p className="font-serif text-newspaper-ink/70">正在搜索原文…</p>
          )}
          {state.phase !== "estimating" && !showStory && (
            <p className="font-serif text-newspaper-ink/60">
              等待生成。填写标题后点击「① 搜索并估价」开始。
            </p>
          )}
          {showStory && (
            <TypewriterText
              key={state.genId}
              full={state.processedText}
              active={state.phase === "generating"}
            />
          )}
          {showStory && state.search?.sourceUrl && (
            <p className="mt-3 text-xs text-newspaper-ink/70 break-all">
              来源：{state.search.sourceUrl}
            </p>
          )}
          {showStory && state.search?.isFallback && (
            <p className="mt-2 text-red-700 font-bold text-sm">
              ⚠️ AI 重构，未经原始文献核实
            </p>
          )}
        </div>

        {/* 右列：神话解析 */}
        <div className="p-4">
          <h2 className="font-serif text-lg font-bold text-newspaper-ink border-b-2 border-newspaper-rule pb-2 mb-3">
            🏺 神话解析
          </h2>
          {!state.needAnalysis ? (
            <p className="font-serif text-newspaper-ink/60">
              （未勾选解析。可在上方「需要神话解析」开启。）
            </p>
          ) : showAnalysis ? (
            <details open={state.phase === "done"}>
              <summary className="cursor-pointer font-serif font-bold text-newspaper-ink">
                解析报告（点击展开/收起）
              </summary>
              <p className="mt-2 whitespace-pre-wrap leading-relaxed text-black">
                {state.analysis}
              </p>
            </details>
          ) : (
            <p className="font-serif text-newspaper-ink/60">
              {state.phase === "generating"
                ? "正在解析…"
                : "（本次未生成解析）"}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
