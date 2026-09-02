# 📰 神话猎手 · THE MYTH HUNTER

单页 Web 应用（SPA）：搜索神话故事原文（TinyFish）→ 用你自己的 LLM API Key 精修/翻译为史诗风格故事 → 可选生成神话解析 → 下载 `.md` 文件。

复古报纸风格界面，Next.js 14 (App Router) + React + Tailwind CSS。**纯静态站点**：全部逻辑在浏览器直连运行，无任何后端，通过 GitHub Actions 部署到 GitHub Pages。

## 快速开始

**Windows 本机一键启动**：双击桌面「神话猎手」快捷方式，或双击项目根目录的 `start-mythhunter.bat` — 启动开发服务并打开浏览器。关闭窗口即停止服务。

**命令行**：

```bash
npm install
cp .env.example .env.local   # 填入 NEXT_PUBLIC_TINYFISH_API_KEY
npm run dev                  # http://localhost:3000/AI-Story-Teller/
```

局域网内其他设备（同一 WiFi）访问 `http://<本机IP>:3000/AI-Story-Teller/`。

**本地静态预览**（验证构建产物）：

```bash
npm run build                # 生成 out/
npm run preview              # http://localhost:3000/AI-Story-Teller/
```

## 环境变量

| 变量 | 说明 |
|---|---|
| `NEXT_PUBLIC_AUTH_PASSWORD` | 页面访问密码（默认 `mimabugaosuni`）。`NEXT_PUBLIC_` 变量构建时打进前端包，属**软门禁**，非安全认证 |
| `NEXT_PUBLIC_TINYFISH_API_KEY` | TinyFish 搜索/抓取凭证（浏览器直连）。在 <https://agent.tinyfish.ai/api-keys> 免费创建（搜索与抓取不扣费） |

## 使用流程

1. 输入访问密码解锁（密码错误时所有按钮置灰）。
2. 左列填入你的 LLM API Key（缓存在浏览器 localStorage），选择供应商（OpenAI 兼容 / 自定义兼容端点）、模型与 Base URL。
3. 右列输入故事标题、目标语言（中文/英文）、风格（如「史诗感」「聊斋风」）、是否解析。
4. 点「① 搜索并估价」→ 弹窗显示原文字数与预估 Credits →「确认」解锁「② 确认并生成」。
5. 浏览器直连你的 LLM 端点流式生成，打字机渲染精修故事与解析报告。
6. 点「保存 Markdown」下载 `.md` 文件（front-matter + 原文 + 精修 + 解析）。

## 架构

```
lib/search.ts     Step 1：TinyFish 搜索→抓取（3 次尝试降级），失败则 LLM 生成概要并加
                  [⚠️ AI 重构，未经原始文献核实] 标记；返回预估费用
lib/process.ts    Step 2 & 3：浏览器直连流式加工 + 解析（事件协议：meta / progress /
                  chunk / analysis_chunk / usage / error / done）；长文本（>8000 汉字 /
                  >6000 tokens）分段并发润色 → 全局合并（[长文本摘要合并版]）
lib/markdown.ts   组装 Markdown（下载由前端 Blob 执行）
lib/              tinyfish（浏览器直连）/ llm（OpenAI 兼容流式）/ cost / chunking
hooks/            useAppState（状态机 + 全部流程调用）
```

- 费用估算：`(原文字数 / 1000 × $0.002) × 3 步骤`；生成时按各次调用实际 token 用量累加。
- 你的 LLM API Key 只从浏览器直发你配置的 LLM 端点，**不经过任何第三方服务器**、不打印到日志（浏览器 localStorage 会缓存 LLM 配置，密码不缓存）。
- **默认配置**：供应商 OpenAI 兼容、模型 `deepseek-v4-flash`、Base URL `https://api.deepseek.com`（可在设置中修改）。留空 Base URL = DeepSeek 默认。
- **浏览器直连的 CORS 限制**：DeepSeek 与 TinyFish 均允许跨域（已验证）；官方 `api.openai.com` / `api.anthropic.com` 不支持浏览器直连，故 Anthropic 供应商已移除；自定义端点需允许 CORS。
- 所有 LLM 文本以纯文本渲染，无 XSS 风险。

## 部署到 GitHub Pages

站点地址：`https://poulnoodle.github.io/AI-Story-Teller/`（`.github/workflows/deploy.yml` 在 push 到 `main` 时自动构建并部署）。

**一次性仓库设置**：

1. 仓库 Settings → Pages → Source 选择 **GitHub Actions**。
2. 仓库 Settings → Secrets and variables → Actions，添加仓库密钥：
   - `TINYFISH_API_KEY`（对应构建时内联的 `NEXT_PUBLIC_TINYFISH_API_KEY`）
   - `NEXT_PUBLIC_AUTH_PASSWORD`（可选，不设则用默认密码 `mimabugaosuni`）
3. 推送代码触发首次部署；站点在 `https://poulnoodle.github.io/AI-Story-Teller/` 上线。

注意：

- 密钥缺失时构建仍会成功：页面密码回退默认值、搜索自动降级为「LLM 生成概要」路径。
- 仓库改名时需同步 `next.config.mjs` 里的 `basePath`。

## 安全说明

- 页面密码为软门禁（前端可见），请勿在公开部署的实例中处理敏感内容。
- ⚠️ `NEXT_PUBLIC_TINYFISH_API_KEY` 会内联进**公开 JS 包**，任何访问者都能查看并盗用。请为公开部署创建专用低权限密钥；密钥被吊销时应用会干净降级为 LLM 生成。
- 极长文本「全局合并」阶段若网络中断，整段流程需重试（分段润色会重新计费），断网时应用会自动重试一次。
