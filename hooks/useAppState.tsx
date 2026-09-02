"use client";

// 前端状态机：locked → ready → estimating → estimated → generating → done
// 解锁：密码 === NEXT_PUBLIC_AUTH_PASSWORD（客户端软门禁，规格书约定）

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import {
  DEFAULT_BASE_URLS,
  DEFAULT_MODELS,
  DEFAULT_PASSWORD,
} from "@/lib/constants";
import { runProcessFlow, type ProcessEvent } from "@/lib/process";
import { searchForStory } from "@/lib/search";
import type {
  Phase,
  Provider,
  SearchResult,
  TargetLang,
} from "@/lib/types";

export interface AppState {
  phase: Phase;
  password: string;
  apiKey: string;
  provider: Provider;
  model: string;
  baseUrl: string;
  title: string;
  targetLang: TargetLang;
  style: string;
  needAnalysis: boolean;
  search: SearchResult | null;
  /** 估价弹窗中点击过「确认」后，② 才可点击 */
  confirmed: boolean;
  showModal: boolean;
  processedText: string;
  analysis: string;
  error: string | null;
  /** 按 usage 事件累加的实际花费 */
  cost: number;
  /** 每次生成的唯一 key，用于重置打字机组件 */
  genId: number;
  /** 加工流程的 meta 事件（normal / long + 分块数） */
  meta: { mode: "normal" | "long"; chunks: number | null } | null;
  /** 长文本分段润色进度 */
  progress: { done: number; total: number } | null;
}

const initialState: AppState = {
  phase: "ready",
  password: "",
  apiKey: "",
  provider: "openai",
  model: DEFAULT_MODELS.openai,
  baseUrl: DEFAULT_BASE_URLS.openai,
  title: "",
  targetLang: "zh",
  style: "史诗感",
  needAnalysis: false,
  search: null,
  confirmed: false,
  showModal: false,
  processedText: "",
  analysis: "",
  error: null,
  cost: 0,
  genId: 0,
  meta: null,
  progress: null,
};

type Action =
  | { type: "SET_FIELD"; field: string; value: string | boolean }
  | { type: "SET_PROVIDER"; provider: Provider }
  | {
      type: "HYDRATE";
      config: Partial<
        Pick<AppState, "apiKey" | "provider" | "model" | "baseUrl">
      >;
    }
  | { type: "PROCESS_META"; mode: "normal" | "long"; chunks: number | null }
  | { type: "PROCESS_PROGRESS"; done: number; total: number }
  | { type: "SEARCH_START" }
  | { type: "SEARCH_OK"; result: SearchResult }
  | { type: "SEARCH_FAIL"; message: string }
  | { type: "CONFIRM" }
  | { type: "CANCEL_MODAL" }
  | { type: "GENERATE_START" }
  | { type: "PROCESS_CHUNK"; delta: string }
  | { type: "ANALYSIS_CHUNK"; delta: string }
  | { type: "PROCESS_USAGE"; cost: number }
  | { type: "PROCESS_ERROR"; message: string }
  | { type: "PROCESS_RETRY"; message: string }
  | { type: "PROCESS_DONE" }
  | { type: "RESET" };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_FIELD":
      return { ...state, [action.field]: action.value };
    case "SET_PROVIDER":
      // 切换供应商时重置默认模型与端点
      return {
        ...state,
        provider: action.provider,
        model: DEFAULT_MODELS[action.provider],
        baseUrl: DEFAULT_BASE_URLS[action.provider],
      };
    case "HYDRATE": {
      // 从 localStorage 恢复 LLM 配置（过滤 undefined，避免覆盖默认值）
      const patch: Partial<AppState> = {};
      if (action.config.apiKey !== undefined) patch.apiKey = action.config.apiKey;
      if (action.config.provider !== undefined) patch.provider = action.config.provider;
      if (action.config.model !== undefined) patch.model = action.config.model;
      if (action.config.baseUrl !== undefined) patch.baseUrl = action.config.baseUrl;
      return { ...state, ...patch };
    }
    case "PROCESS_META":
      return { ...state, meta: { mode: action.mode, chunks: action.chunks }, progress: null };
    case "PROCESS_PROGRESS":
      return { ...state, progress: { done: action.done, total: action.total } };
    case "SEARCH_START":
      return {
        ...state,
        phase: "estimating",
        error: null,
        search: null,
        confirmed: false,
        showModal: false,
      };
    case "SEARCH_OK":
      return {
        ...state,
        phase: "estimated",
        search: action.result,
        showModal: true,
        error: null,
      };
    case "SEARCH_FAIL":
      return { ...state, phase: "ready", error: action.message, search: null };
    case "CONFIRM":
      return { ...state, showModal: false, confirmed: true };
    case "CANCEL_MODAL":
      return { ...state, showModal: false, confirmed: false };
    case "GENERATE_START":
      return {
        ...state,
        phase: "generating",
        processedText: "",
        analysis: "",
        error: null,
        cost: 0,
        genId: state.genId + 1,
        meta: null,
        progress: null,
      };
    case "PROCESS_CHUNK":
      return { ...state, processedText: state.processedText + action.delta };
    case "ANALYSIS_CHUNK":
      return { ...state, analysis: state.analysis + action.delta };
    case "PROCESS_USAGE":
      return { ...state, cost: state.cost + action.cost };
    case "PROCESS_ERROR":
      // 保留已生成的部分文本，回到可重试状态（② 可直接再次点击）
      return { ...state, phase: "estimated", error: action.message, progress: null };
    case "PROCESS_RETRY":
      // 连接中断自动重试：保持生成中状态，提示正在重试
      return { ...state, phase: "generating", error: action.message };
    case "PROCESS_DONE":
      return { ...state, phase: "done" };
    case "RESET":
      return {
        ...initialState,
        password: state.password,
        apiKey: state.apiKey,
        provider: state.provider,
        model: state.model,
        baseUrl: state.baseUrl,
      };
    default:
      return state;
  }
}

interface AppContextValue {
  state: AppState;
  unlocked: boolean;
  btn1Enabled: boolean;
  btn2Enabled: boolean;
  setField: (field: string, value: string | boolean) => void;
  setProvider: (provider: Provider) => void;
  runSearch: () => Promise<void>;
  confirm: () => void;
  cancelModal: () => void;
  runGenerate: () => Promise<void>;
  reset: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

/** LLM 配置的浏览器缓存 key（API Key 按用户要求持久化，访问密码不缓存） */
const STORAGE_KEY = "mythhunter-llm-config";

const VALID_PROVIDERS: Provider[] = ["openai", "custom"];

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const abortRef = useRef<AbortController | null>(null);

  const unlocked =
    state.password ===
    (process.env.NEXT_PUBLIC_AUTH_PASSWORD || DEFAULT_PASSWORD);

  // 挂载时从 localStorage 恢复 LLM 配置（API Key / 供应商 / 模型 / Base URL）
  // 旧默认值（gpt-4o-mini / 空或官方地址）自动迁移到新默认（DeepSeek）
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const config = JSON.parse(raw) as Record<string, unknown>;
      let provider = VALID_PROVIDERS.includes(config.provider as Provider)
        ? (config.provider as Provider)
        : undefined;
      let model = typeof config.model === "string" ? config.model : undefined;
      let baseUrl = typeof config.baseUrl === "string" ? config.baseUrl : undefined;
      if (config.provider === "anthropic") {
        // 静态版无法直连 Anthropic 官方 API（浏览器无 CORS）：
        // 整体重置为 openai 默认，避免残留 claude 模型名错配到 DeepSeek 端点
        provider = "openai";
        model = DEFAULT_MODELS.openai;
        baseUrl = DEFAULT_BASE_URLS.openai;
      }
      if (!provider || provider === "openai") {
        // 旧默认迁移：model 为旧默认、baseUrl 为空或旧官方地址 → 换用新默认
        if (model === "gpt-4o-mini") model = DEFAULT_MODELS.openai;
        const trimmed = (baseUrl ?? "").trim();
        if (trimmed === "" || trimmed === "https://api.openai.com/v1") {
          baseUrl = DEFAULT_BASE_URLS.openai;
        }
      }
      dispatch({
        type: "HYDRATE",
        config: {
          apiKey: typeof config.apiKey === "string" ? config.apiKey : undefined,
          provider,
          model,
          baseUrl,
        },
      });
    } catch {
      // 缓存损坏时静默忽略
    }
  }, []);

  // LLM 配置变化时写入 localStorage（跳过挂载后首次触发，避免用默认值覆盖缓存）
  const skipPersist = useRef(true);
  useEffect(() => {
    if (skipPersist.current) {
      skipPersist.current = false;
      return;
    }
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          apiKey: state.apiKey,
          provider: state.provider,
          model: state.model,
          baseUrl: state.baseUrl,
        })
      );
    } catch {
      // 隐私模式等场景下忽略
    }
  }, [state.apiKey, state.provider, state.model, state.baseUrl]);

  // 组件卸载时中止进行中的流
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const setField = (field: string, value: string | boolean) =>
    dispatch({ type: "SET_FIELD", field, value });

  const setProvider = (provider: Provider) =>
    dispatch({ type: "SET_PROVIDER", provider });

  const runSearch = async () => {
    if (!unlocked || state.phase === "estimating") return;
    dispatch({ type: "SEARCH_START" });
    try {
      const data = await searchForStory({
        title: state.title,
        targetLang: state.targetLang,
        userApiKey: state.apiKey || undefined,
        provider: state.provider,
        model: state.model,
        baseUrl: state.baseUrl || undefined,
      });
      if (data.rawText) {
        dispatch({ type: "SEARCH_OK", result: data });
      } else {
        dispatch({
          type: "SEARCH_FAIL",
          message: data.error || "搜索失败，请重试",
        });
      }
    } catch {
      dispatch({ type: "SEARCH_FAIL", message: "网络错误，请重试" });
    }
  };

  const confirm = () => dispatch({ type: "CONFIRM" });
  const cancelModal = () => dispatch({ type: "CANCEL_MODAL" });

  const runGenerate = async () => {
    if (state.phase !== "estimated" || !state.confirmed || !state.search) {
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    dispatch({ type: "GENERATE_START" });

    // 流可能在没有 done/error 事件的情况下终止（浏览器直连提供商时，
    // 切换标签页被浏览器节流/冻结、移动端切后台断网等）。传输中断时
    // 自动重试一次，仍失败才报错并保留手动重试（② 可再次点击）。
    const MAX_AUTO_RETRIES = 1;

    for (let attempt = 1; attempt <= MAX_AUTO_RETRIES + 1; attempt++) {
      try {
        await runProcessFlow(
          {
            rawText: state.search.rawText,
            style: state.style,
            needAnalysis: state.needAnalysis,
            userApiKey: state.apiKey,
            provider: state.provider,
            model: state.model,
            baseUrl: state.baseUrl || undefined,
            title: state.title,
            targetLang: state.targetLang,
          },
          {
            signal: controller.signal,
            // data 载荷形状已在生产者 lib/process.ts 侧编译期兜底（ProcessEventMap），
            // 消费侧沿用旧 SSE 解析的宽松处理（typeof 防御性校验）
            emit: (event: ProcessEvent, data: any) => {
              switch (event) {
                case "meta":
                  dispatch({
                    type: "PROCESS_META",
                    mode: data.mode === "long" ? "long" : "normal",
                    chunks:
                      typeof data.chunks === "number" ? data.chunks : null,
                  });
                  break;
                case "progress":
                  dispatch({
                    type: "PROCESS_PROGRESS",
                    done: typeof data.done === "number" ? data.done : 0,
                    total: typeof data.total === "number" ? data.total : 0,
                  });
                  break;
                case "chunk":
                  if (typeof data.delta === "string") {
                    dispatch({ type: "PROCESS_CHUNK", delta: data.delta });
                  }
                  break;
                case "analysis_chunk":
                  if (typeof data.delta === "string") {
                    dispatch({ type: "ANALYSIS_CHUNK", delta: data.delta });
                  }
                  break;
                case "usage":
                  dispatch({
                    type: "PROCESS_USAGE",
                    cost:
                      typeof data.estimatedCost === "number"
                        ? data.estimatedCost
                        : 0,
                  });
                  break;
                case "error":
                  dispatch({
                    type: "PROCESS_ERROR",
                    message:
                      typeof data.message === "string"
                        ? data.message
                        : "处理失败，请重试",
                  });
                  break;
                case "done":
                  dispatch({ type: "PROCESS_DONE" });
                  break;
                default:
                  break;
              }
            },
          }
        );
        // runProcessFlow 保证 error/done 事件在正常 resolve 前发出
        break;
      } catch {
        // 主动中止（重新生成/卸载）不报错
        if (controller.signal.aborted) break;
        if (attempt <= MAX_AUTO_RETRIES) {
          dispatch({
            type: "PROCESS_RETRY",
            message: `连接中断，正在自动重试（第 ${attempt} 次）…`,
          });
          continue;
        }
        dispatch({ type: "PROCESS_ERROR", message: "网络错误，请点击②重试" });
        break;
      }
    }
  };

  const reset = () => dispatch({ type: "RESET" });

  const btn1Enabled =
    unlocked &&
    (state.phase === "ready" ||
      state.phase === "estimated" ||
      state.phase === "done") &&
    state.title.trim().length > 0;
  const btn2Enabled =
    unlocked &&
    state.phase === "estimated" &&
    state.confirmed &&
    !!state.search?.rawText;

  return (
    <AppContext.Provider
      value={{
        state,
        unlocked,
        btn1Enabled,
        btn2Enabled,
        setField,
        setProvider,
        runSearch,
        confirm,
        cancelModal,
        runGenerate,
        reset,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppState(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppState 必须在 AppStateProvider 内使用");
  return ctx;
}
