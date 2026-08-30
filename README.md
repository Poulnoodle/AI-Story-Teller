# 📰 神话猎手 · THE MYTH HUNTER

单页 Web 应用（SPA）：搜索神话故事原文（TinyFish）→ 用你自己的 LLM API Key 精修/翻译为史诗风格故事 → 可选生成神话解析 → 下载 `.md` 文件。

复古报纸风格界面，Next.js 14 (App Router) + React + Tailwind CSS，可直接部署到 Vercel。

## 快速开始

```bash
npm install
cp .env.example .env.local   # 填入 TINYFISH_API_KEY
npm run dev                  # http://localhost:3000
```

## 环境变量

| 变量 | 说明 |
|---|---|
| `NEXT_PUBLIC_AUTH_PASSWORD` | 页面访问密码（默认 `mimabugaosuni`）。注意：`NEXT_PUBLIC_` 变量会打进前端包，属**软门禁**，非安全认证 |
| `TINYFISH_API_KEY` | TinyFish 搜索/抓取凭证，**仅后端使用**。在 <https://agent.tinyfish.ai/api-keys> 免费创建（搜索与抓取不扣费） |

## 使用流程

1. 输入访问密码解锁（密码错误时所有按钮置灰）。
2. 左列填入你的 LLM API Key（**仅存内存，不做任何持久化**），选择供应商（OpenAI / Anthropic / 自定义兼容端点）、模型与 Base URL。
3. 右列输入故事标题、目标语言（中文/英文）、风格（如「史诗感」「聊斋风」）、是否解析。
4. 点「① 搜索并估价」→ 弹窗显示原文字数与预估 Credits →「确认」解锁「② 确认并生成」。
5. 后端流式返回，前端打字机渲染精修故事与解析报告。
6. 点「保存 Markdown」下载 `.md` 文件（front-matter + 原文 + 精修 + 解析）。

## 架构

```
app/api/search    Step 1：TinyFish 搜索→抓取（3 次尝试降级），失败则 LLM 生成概要并加
                  [⚠️ AI 重构，未经原始文献核实] 标记；返回预估费用
app/api/process   Step 2 & 3：SSE 流式加工 + 解析；长文本（>8000 汉字 / >6000 tokens）
                  分段并发润色 → 全局合并（[长文本摘要合并版]）
app/api/save      组装 Markdown（下载由前端 Blob 执行）
lib/              tinyfish / llm（OpenAI+Anthropic+自定义端点流式）/ cost / chunking
hooks/            useAppState（状态机）、useSSE
```

- 费用估算：`(原文字数 / 1000 × $0.002) × 3 步骤`；生成时按各次调用实际 token 用量累加。
- 用户 LLM Key 仅随请求透传后端，不落盘、不打日志。
- 所有 LLM 文本以纯文本渲染，无 XSS 风险。

## 部署到 Vercel

```bash
npm i -g vercel
vercel deploy
```

在 Vercel 项目设置中配置环境变量：

- `NEXT_PUBLIC_AUTH_PASSWORD`（构建时内联进前端包）
- `TINYFISH_API_KEY`

### 注意事项（Vercel Hobby 60 秒限制）

- 三个 API 路由均设 `maxDuration = 60`。
- 分块阈值（单块 ≤2500 字符、并发 3）已按 60s 预算调优；极长文本的「全局合并」步骤仍可能超时，此时前端会收到 `error` 事件，可直接重试。
- Vercel **Pro** 可将限制提升到 300s：把三个路由的 `maxDuration` 改为 `300` 即可。

## 安全说明

- 页面密码为软门禁（前端可见），请勿在公开部署的实例中处理敏感内容。
- 你的 LLM API Key 仅保存在浏览器内存中，刷新页面即清空；TinyFish Key 只存在于服务端环境变量。
