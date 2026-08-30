"use client";

// 左列（设置）：密码、API Key、供应商、模型、Base URL

import { useAppState } from "@/hooks/useAppState";
import { PROVIDERS } from "@/lib/constants";
import type { Provider } from "@/lib/types";

const labelCls = "block font-serif text-sm font-bold text-newspaper-ink mb-1";
const inputCls =
  "w-full border-2 border-newspaper-rule/60 bg-white/70 px-3 py-2 text-black font-serif focus:outline-none focus:border-newspaper-ink";

export default function SettingsPanel() {
  const { state, setField, setProvider } = useAppState();

  return (
    <section className="p-4 border-2 border-newspaper-rule bg-white/40">
      <h2 className="font-serif text-lg font-bold text-newspaper-ink mb-3 border-b-2 border-newspaper-rule pb-2">
        🔑 报社证件（设置）
      </h2>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>访问密码</label>
          <input
            type="password"
            className={inputCls}
            placeholder="mimabugaosuni"
            value={state.password}
            onChange={(e) => setField("password", e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>LLM API Key（仅存内存，刷新即清空）</label>
          <input
            type="password"
            className={inputCls}
            placeholder="sk-... / 你的密钥"
            value={state.apiKey}
            onChange={(e) => setField("apiKey", e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>供应商</label>
          <select
            className={inputCls}
            value={state.provider}
            onChange={(e) => setProvider(e.target.value as Provider)}
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>模型名称</label>
          <input
            className={inputCls}
            value={state.model}
            onChange={(e) => setField("model", e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Base URL（留空使用官方默认端点）</label>
          <input
            className={inputCls}
            placeholder={
              state.provider === "custom"
                ? "需含 /v1，如 https://api.example.com/v1"
                : undefined
            }
            value={state.baseUrl}
            onChange={(e) => setField("baseUrl", e.target.value)}
          />
        </div>
      </div>
    </section>
  );
}
