"use client";

// 右列（搜索）：故事标题、目标语言、风格、是否解析

import { useAppState } from "@/hooks/useAppState";
import { LANGUAGES, STYLE_PRESETS } from "@/lib/constants";
import type { TargetLang } from "@/lib/types";

const labelCls = "block font-serif text-sm font-bold text-newspaper-ink mb-1";
const inputCls =
  "w-full border-2 border-newspaper-rule/60 bg-white/70 px-3 py-2 text-black font-serif focus:outline-none focus:border-newspaper-ink";

export default function SearchPanel() {
  const { state, setField } = useAppState();

  return (
    <section className="p-4 border-2 border-newspaper-rule bg-white/40">
      <h2 className="font-serif text-lg font-bold text-newspaper-ink mb-3 border-b-2 border-newspaper-rule pb-2">
        🔍 采编任务（搜索）
      </h2>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>故事标题</label>
          <input
            className={inputCls}
            placeholder="例如：北欧神话 雷神托尔"
            value={state.title}
            onChange={(e) => setField("title", e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>目标语言</label>
          <select
            className={inputCls}
            value={state.targetLang}
            onChange={(e) => setField("targetLang", e.target.value as TargetLang)}
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>风格</label>
          <input
            className={inputCls}
            list="style-presets"
            placeholder="如：史诗感 / 聊斋风 / 白话文"
            value={state.style}
            onChange={(e) => setField("style", e.target.value)}
          />
          <datalist id="style-presets">
            {STYLE_PRESETS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 accent-newspaper-gold"
            checked={state.needAnalysis}
            onChange={(e) => setField("needAnalysis", e.target.checked)}
          />
          <span className="font-serif text-sm font-bold text-newspaper-ink">
            需要神话解析
          </span>
        </label>
      </div>
    </section>
  );
}
