import type { Provider, TargetLang } from "./types";

/** 各供应商默认模型（UI 中可编辑） */
export const DEFAULT_MODELS: Record<Provider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-7-sonnet-latest",
  custom: "",
};

/**
 * 各供应商默认 Base URL（留空即用官方默认端点）。
 * openai 的 Base URL 语义为「备用端点」：官方连接失败时自动切换。
 */
export const DEFAULT_BASE_URLS: Record<Provider, string> = {
  openai: "",
  anthropic: "",
  custom: "",
};

export const PROVIDERS: { value: Provider; label: string }[] = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "custom", label: "自定义兼容端点（OpenAI 格式）" },
];

/** v1 支持的目标语言：中文 / 英文 */
export const LANGUAGES: { value: TargetLang; label: string }[] = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
];

export const STYLE_PRESETS = ["史诗感", "聊斋风", "白话文"];

/** 搜索降级（LLM 生成）时包裹 rawText 的强制标记 */
export const FALLBACK_MARKER = "[⚠️ AI 重构，未经原始文献核实]";

/** 长文本分块合并版标题标记 */
export const LONG_MODE_MARKER = "[长文本摘要合并版]";

/** 默认页面密码（可被 NEXT_PUBLIC_AUTH_PASSWORD 覆盖） */
export const DEFAULT_PASSWORD = "mimabugaosuni";
