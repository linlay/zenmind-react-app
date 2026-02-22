# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 常用命令

```bash
npm run start        # 启动 Expo 开发服务器（交互式选择平台）
npm run ios          # iOS 模拟器运行
npm run android      # Android 模拟器/设备运行
npm run web          # 浏览器运行
npm run test         # 运行 Jest 测试
npm run typecheck    # TypeScript 类型检查（tsc --noEmit）
npm run build        # Expo 导出构建
```

无独立 lint 命令，项目未配置 ESLint。

## 架构概览

React Native (Expo) + TypeScript 移动应用，采用 **四业务域单壳架构**。

### 应用壳层

`ShellScreen` 是主容器，管理动画抽屉导航和域切换。不使用 React Navigation，而是通过 `activeDomain` 状态条件渲染四个域屏幕：

- **chat** — 聊天助理（主域，最复杂）
- **terminal** — PTY 终端（WebView 包装）
- **agents** — 智能体管理
- **user** — 用户设置

域切换由 `DomainSwitcher` 组件触发，状态持久化到 AsyncStorage。

### 状态管理

Redux Toolkit，5 个 slice（shell、user、agents、chat、terminal）+ 2 个 RTK Query API（chatApi、agentsApi）。

- RTK Query 使用 `fakeBaseQuery` + 自定义 `queryFn` 模式
- 聊天时间线数据存储在组件本地 state（非 Redux），通过事件 reducer 构建
- Typed hooks：`useAppDispatch`、`useAppSelector`（位于 `src/app/store/hooks.ts`）

### 聊天域事件流水线

聊天是最复杂的模块，采用 SSE 流式架构：

```
POST /api/query (SSE) → XMLHttpRequest 流式读取
  → chatStreamClient.ts (SSE 解析)
  → eventNormalizer.ts (事件类型归一化 + 任务解析)
  → eventReducer.ts (统一 reducer 构建时间线)
  → FlatList 渲染
```

支持 Frontend Tool 集成：后端返回 HTML，通过 WebView 嵌入聊天中，双向消息通信。

### 网络层

- `core/network/apiClient.ts` — fetch 封装，统一信封解析 `ApiEnvelope<T> { code, msg, data }`
- `core/network/endpoint.ts` — URL 规范化（检测内网 IP 用 http，公网用 https）
- SSE 流通过 XMLHttpRequest 实现（`chatStreamClient.ts`）

### WebView 鉴权桥接协议

当前采用“**App 主动预刷新 + WebView 401 兜底刷新**”组合策略，避免 App 切前台后 WebView 因旧 token 立即 401。

#### 消息协议

| 消息类型 | 方向 | 字段 | 用途 |
|----------|------|------|------|
| `auth_token` | RN -> WebView | `accessToken`, `accessExpireAtMs?` | 主动下发最新 access token |
| `auth_refresh_request` | WebView -> RN | `requestId`, `source` | WebView 侧 API 401 时请求 RN 刷新 |
| `auth_refresh_result` | RN -> WebView | `requestId`, `ok`, `accessToken?`, `error?` | 返回本次刷新结果，供 WebView 决定重放或进入未登录态 |

#### 关键流程

1. WebView 在 H5 内部捕获 401，立即 `postMessage({ type: 'auth_refresh_request', ... })`。
2. RN `onMessage` 解析后，调用 `onWebViewAuthRefreshRequest` 触发刷新。
3. `ShellScreen` 通过 `WebViewAuthRefreshCoordinator` 做单飞（并发请求仅一次 refresh）。
4. 刷新成功回 `auth_refresh_result(ok=true, accessToken)`；失败回 `ok=false`。
5. WebView 在 `auth_refresh_result` 成功前应排队待重放请求，失败时清理鉴权状态并引导重登。

#### App 主动广播机制

- 前台保活刷新：
  - App 回到 `active` 时触发一次预刷新（带 debounce）。
  - 前台期间每 60s 定时触发预刷新。
- 预刷新入口 `ensureFreshAccessToken()` 使用最小有效期阈值 + 抖动（默认 90s + 8s）决定是否 refresh。
- 只要 session 更新，`syncAuthStateFromSession()` 会更新 `authAccessToken/authAccessExpireAtMs` 并递增 `authTokenSignal`。
- `authTokenSignal` 变化后，已挂载 WebView（Chat Frontend Tool、Terminal）通过 `injectJavaScript(window.postMessage(...))` 广播 `auth_token`。

#### 代码锚点

- 协议定义与构造：`src/core/auth/webViewAuthBridge.ts`
- 刷新与会话订阅：`src/core/auth/appAuth.ts`
- 统一协调与定时预刷新：`src/app/shell/ShellScreen.tsx`
- Terminal WebView 桥接：`src/modules/terminal/components/TerminalWebView.tsx`
- Chat Frontend Tool WebView 桥接：`src/modules/chat/components/Composer.tsx`、`src/modules/chat/screens/ChatAssistantScreen.tsx`

#### 开发接入指南（必须遵循）

1. **先统一桥接消息类型**
   - 所有鉴权桥接消息仅允许三种：`auth_token`、`auth_refresh_request`、`auth_refresh_result`。
   - 消息结构必须复用 `src/core/auth/webViewAuthBridge.ts` 的构造/解析函数，不要在业务代码手写字段。

2. **明确传输通道（不是 HTTP 协议替代，而是 WebView 消息桥）**
   - WebView -> RN：H5 调 `window.postMessage(payload, '*')`，由 `injectedJavaScript` 劫持后转发到 `window.ReactNativeWebView.postMessage(JSON.stringify(payload))`。
   - RN -> WebView：RN 通过 `injectJavaScript(buildWebViewPostMessageScript(payload))` 注入 `window.postMessage(payload, '*')` 到 H5 页面。
   - 结论：这是基于 `react-native-webview` 的双向消息桥协议，token 刷新本身仍由 RN 调后端 `/api/auth/refresh` 完成。

3. **RN 侧接入步骤（Terminal / Frontend Tool 都一致）**
   - WebView 注入桥脚本，只透传白名单消息类型（至少含 `auth_refresh_request`）。
   - `onMessage` 里用 `parseWebViewAuthRefreshRequest()` 解析请求，忽略无法解析的数据。
   - 收到请求后调用 `onWebViewAuthRefreshRequest(requestId, source)`，该回调最终走 `WebViewAuthRefreshCoordinator.refresh()` 做单飞刷新。
   - 刷新结果用 `createWebViewAuthRefreshResultMessage()` 回写 WebView。
   - WebView `onLoad` 时主动下发一次 `auth_token`；后续每次 `authTokenSignal` 变化再次下发。

4. **H5 侧接入步骤（前端工具页面 / PTY 页面）**
   - 维护内存态 `accessToken/accessExpireAtMs`，监听 `window.message` 接收 `auth_token` 并更新。
   - 所有 API 请求统一走带鉴权封装：先带当前 token 请求，遇到 401 触发 `auth_refresh_request`。
   - 发起 refresh 请求时生成 `requestId`，并将本次失败请求加入待重放队列。
   - 收到 `auth_refresh_result(ok=true)`：更新 token 并重放队列；`ok=false`：清空队列并进入未登录态。
   - 并发 401 时要在 H5 侧做“等待同一次刷新结果”的去重，避免页面同时发多个 refresh 请求。

5. **时序约束（避免常见线上问题）**
   - App 回前台与前台定时器会触发 `ensureFreshAccessToken()` 预刷新；即使如此，WebView 仍必须保留 401 兜底刷新逻辑。
   - `auth_refresh_result` 必须按 `requestId` 对应到原请求；不要用“最后一次结果”覆盖所有等待项。
   - 不要把 token 落日志、落 localStorage、或通过 URL query 传给 H5。
   - 刷新失败（hard failure）后由 RN 统一清会话并引导重登，WebView 只负责进入未登录 UI。

6. **最小验收清单**
   - WebView 初次加载后 1 次 `auth_token` 下发成功。
   - 人工构造 access token 过期后，WebView 首次 401 能触发 `auth_refresh_request` 并成功重放。
   - 并发 3 个 401 请求只触发 1 次 RN refresh（其余复用结果）。
   - refresh 失败时，RN/H5 双方都进入未登录态且不死循环重试。

### 后端 API 协议

| 方法 | 端点 | 用途 |
|------|------|------|
| GET | `/api/agents` | 智能体列表 |
| GET | `/api/chats` | 聊天摘要列表 |
| GET | `/api/chat?chatId=...` | 聊天历史事件 |
| GET | `/api/viewport?viewportKey=...` | Frontend Tool HTML |
| POST | `/api/query` | 流式聊天查询（SSE） |
| POST | `/api/submit` | 提交 Frontend Tool 结果 |

### 持久化

AsyncStorage 存储应用设置，key 为 `mobile_app_settings_v2`。应用启动时自动从 v1 迁移。

## 模块结构约定

每个业务域遵循统一目录结构：

```
modules/[domain]/
├── api/          # RTK Query 端点
├── services/     # 业务逻辑
├── state/        # Redux slice + selectors
├── screens/      # 顶层屏幕组件
├── components/   # 子组件
├── types/        # TypeScript 接口
├── utils/        # 工具函数
└── __tests__/    # Jest 测试
```

## 样式约定

- `StyleSheet.create()` 定义样式
- 主题通过 props 传递（`core/constants/theme.ts` 定义 light/dark 调色板）
- 无 CSS-in-JS 库，纯 React Native 样式
- 响应式布局使用 `useWindowDimensions()` hook
- 平台差异处理：iOS 使用 KeyboardAvoidingView padding，Android 不需要

## 计划栏 (Plan Bar) 事件架构

### 双层更新模型

计划栏采用内容层 + 状态层的双层更新模型：

| 层 | 事件 | 说明 |
|---|---|---|
| 内容层 | `plan.update` | 全量替换：携带 `plan[]` 数组，整体替换 `planState.tasks` |
| 状态层 | `task.start` / `task.complete` / `task.fail` / `task.cancel` | 增量更新：按 `taskId` 定位单条任务，修改其 `status` |

### 数据结构

```typescript
interface PlanState {
  planId: string;          // 当前计划 ID
  tasks: PlanTask[];       // 任务列表
  expanded: boolean;       // UI 展开/收起状态
  lastTaskId: string;      // 最近活跃的 taskId
}

interface PlanTask {
  taskId: string;          // 唯一标识
  description: string;     // 任务描述文本
  status: 'init' | 'running' | 'done' | 'failed';
}
```

### 事件处理流程

1. `plan.update` → 全量替换 `tasks`，通过 `normalizePlanTask()` 归一化
2. `task.start` → 设置 `status = 'running'`
3. `task.complete` → 设置 `status = normalizeTaskStatus()` 结果（通常为 `'done'`）
4. `task.fail` → 设置 `status = 'failed'`
5. `task.cancel` → 设置 `status = 'done'`（`PlanTask['status']` 类型无 `'cancelled'`，映射为完成）
6. 若 `taskId` 不在现有列表中，自动追加新条目

### UI 交互

- 展开/收起：用户点击切换 `expanded` 状态
- 自动收起：最后一个任务完成后 1.5s 自动收起
- `cleanPlanTaskDescription()`：清理 markdown 标记，提取纯文本用于 UI 显示

## SSE 事件协议

### 传输层

- 使用 XMLHttpRequest 实现 SSE 流式读取（`chatStreamClient.ts`）
- `POST /api/query` 发起查询，响应为 `text/event-stream`
- 每个 SSE 块格式：`data: {JSON}\n\n`
- 解析入口：`parseSseBlock()` → 逐块解析 → `applyEvent()` 分发

### 完整事件类型表

#### 会话控制事件

| 事件类型 | 关键字段 | 说明 |
|----------|----------|------|
| `request.query` | `requestId`, `message` | 用户消息回显 |
| `chat.start` | — | 会话开始，无需处理 |
| `run.start` | `runId` | 运行开始，记录 runId |
| `run.complete` | `runId` | 运行正常结束 |
| `run.cancel` | `runId` | 运行被取消 |
| `run.error` | `error` | 运行出错 |

#### 内容流事件

| 事件类型 | 关键字段 | 说明 |
|----------|----------|------|
| `content.start` | `contentId`, `text` | 助手内容开始 |
| `content.delta` | `contentId`, `delta` | 助手内容增量 |
| `content.end` | `contentId`, `text` | 助手内容结束 |
| `content.snapshot` | `contentId`, `text` / `content` | 助手内容快照（历史加载） |

#### 推理事件

| 事件类型 | 关键字段 | 说明 |
|----------|----------|------|
| `reasoning.start` | `reasoningId`, `text` | 推理开始 |
| `reasoning.delta` | `reasoningId`, `delta` | 推理增量 |
| `reasoning.end` | `reasoningId` | 推理结束 |
| `reasoning.snapshot` | `reasoningId`, `text` | 推理快照（历史加载） |

#### 工具调用事件

| 事件类型 | 关键字段 | 说明 |
|----------|----------|------|
| `tool.start` | `toolId`, `toolName`, `toolType`, `toolKey` | 工具调用开始 |
| `tool.args` | `toolId`, `delta` | 工具参数增量流 |
| `tool.end` | `toolId`, `error`(可选) | 工具调用结束 |
| `tool.params` | `toolId`, `toolParams`(对象) | 前端工具参数（由 `/api/submit` 触发，仅 HITL 工具） |
| `tool.result` | `toolId`, `result` / `output` | 工具执行结果 |
| `tool.snapshot` | `toolId`, `arguments`(JSON 字符串), `toolParams`(对象) | 工具快照（历史加载携带完整参数） |

#### 动作事件

| 事件类型 | 关键字段 | 说明 |
|----------|----------|------|
| `action.start` | `actionId`, `actionName` | 动作开始 |
| `action.args` | `actionId`, `delta` | 动作参数增量 |
| `action.end` | `actionId`, `error`(可选) | 动作结束，触发 `execute_action` 副作用 |
| `action.result` | `actionId`, `result` / `output` | 动作结果 |
| `action.snapshot` | `actionId` | 动作快照 |

#### 计划事件

| 事件类型 | 关键字段 | 说明 |
|----------|----------|------|
| `plan.update` | `planId`, `plan[]` | 全量替换计划任务列表 |
| `task.start` | `taskId`, `description` | 单任务开始执行 |
| `task.complete` | `taskId`, `status` | 单任务完成 |

| `task.fail` | `taskId`, `error` | 单任务失败 |
| `task.cancel` | `taskId` | 单任务取消 |

## 事件处理流水线架构

### 完整数据流

```
POST /api/query (SSE 响应)
  → XMLHttpRequest onprogress
  → parseSseBlock()          # SSE 文本 → JSON 对象
  → applyEvent()             # 路由：设置 chatId、调用 reduceChatEvent
  → reduceChatEvent()        # 纯函数：(prevState, event, source, runtime) → { nextState, effects }
  → handleEffects()          # 副作用执行：set_chat_id / execute_action / stream_end / activate_frontend_tool
  → React setState()         # 触发 FlatList 重渲染
```

### Runtime Maps（运行时映射表）

`ChatRuntimeMaps` 在单次会话加载期间维护，用于将后端 ID 映射到时间线条目 ID：

| Map | 用途 |
|-----|------|
| `contentIdMap` | `contentId` → 时间线 `assistant:N` |
| `toolIdMap` | `toolId` → 时间线 `tool:N` |
| `actionIdMap` | `actionId` → 时间线 `action:N` |
| `reasoningIdMap` | `reasoningId` → 时间线 `reasoning:N` |
| `actionStateMap` | `actionId` → 动作累积状态（argsText, resultText, executed） |
| `toolStateMap` | `toolId` → 工具累积状态（argsBuffer, toolName, toolParams 等） |

### 副作用（ChatEffect）

| 类型 | 触发时机 | 行为 |
|------|----------|------|
| `set_chat_id` | 任何携带 `chatId` 的事件 | 更新组件 chatId 状态 |
| `execute_action` | `action.end`（仅 live） | 执行动作对应的业务逻辑 |
| `stream_end` | `run.complete` / `run.cancel` / `run.error` | 标记流结束 |
| `activate_frontend_tool` | `tool.start`/`tool.snapshot`（仅 live + Frontend Tool） | 激活 WebView 前端工具 |

## 历史加载 vs 实时流差异

| 维度 | 实时流 (`source='live'`) | 历史加载 (`source='history'`) |
|------|--------------------------|-------------------------------|
| 数据来源 | `POST /api/query` SSE 响应 | `GET /api/chat?chatId=` 返回事件数组 |
| 事件顺序 | 逐个到达，有时间间隔 | 批量到达，顺序遍历 |
| 内容事件 | `content.start` → 多个 `content.delta` → `content.end` | 通常为 `content.snapshot`（完整文本） |
| 工具参数 | `tool.start` → 多个 `tool.args` 增量 → `tool.end` | `tool.snapshot` 携带 `arguments` + `toolParams` |
| `isStreamingContent` | `true`（流式标记，控制光标动画） | `false` |
| 副作用执行 | 执行（action.end 触发 execute_action） | 不执行（避免重放副作用） |
| Frontend Tool | 激活 WebView（activate_frontend_tool） | 不激活 |
| 时间戳回退 | `Date.now()` | 从事件字段提取 |
| Runtime Maps | 持续累积 | 一次性构建完成 |
| planState | 增量更新（可见动画） | 批量构建最终状态 |
| streaming 状态 | `true` → `false`（run.complete 时） | 始终 `false` |
| 典型耗时 | 数秒到数分钟（取决于 LLM 响应） | 毫秒级（本地遍历） |
