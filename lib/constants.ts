import type { Provider, TargetLang } from "./types";

/** 各供应商默认模型（UI 中可编辑） */
export const DEFAULT_MODELS: Record<Provider, string> = {
  openai: "deepseek-v4-flash",
  anthropic: "claude-3-7-sonnet-latest",
  custom: "",
};

/**
 * 各供应商默认 Base URL。
 * openai：填写后作为主端点，连接失败自动回退官方 api.openai.com；留空则只用官方。
 */
export const DEFAULT_BASE_URLS: Record<Provider, string> = {
  openai: "https://api.deepseek.com",
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

/** 优先神话资料来源站点（第一次搜索只在这些站内进行，保证原文质量） */
export const PREFERRED_SITES = [
  { domain: "quangushi.com", name: "远古故事" },
  { domain: "wikiwand.com", name: "Wikiwand" },
  { domain: "3zn.org", name: "三真网" },
  { domain: "mythzh.com", name: "神话中华" },
  { domain: "cbaigui.com", name: "中国百鬼" },
  { domain: "pantheon.org", name: "Encyclopedia Mythica" },
  { domain: "sacred-texts.com", name: "Sacred Texts" },
  { domain: "theoi.com", name: "Theoi" },
  { domain: "mythopedia.com", name: "Mythopedia" },
  { domain: "gutenberg.org", name: "Project Gutenberg" },
] as const;

/** 优先站域名（TinyFish include_domains 用，逗号分隔） */
export const PREFERRED_DOMAINS = PREFERRED_SITES.map((s) => s.domain).join(",");

/** 仅参与候选加权（不加 -1 分）的同族优质站：维基百科为 wikiwand 的镜像来源 */
export const BOOSTED_DOMAINS = ["wikipedia.org"];
