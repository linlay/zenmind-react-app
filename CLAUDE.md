# CLAUDE.md

Claude Code 开发指南。修改代码前必须阅读此文件。

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

React Native (Expo SDK 54) + TypeScript 5.9 移动应用，采用 **四业务域单壳架构**。

### 应用启动链

```
index.js → registerRootComponent(App)
  → App.tsx: SafeAreaProvider > AppProviders > AppRoot
    → AppProviders.tsx: Redux Provider(store)
      → AppRoot.tsx: <ShellScreen />
```

### 应用壳层 (ShellScreen)

`src/app/shell/ShellScreen.tsx` 是唯一主容器（~2100 行），职责：

1. **鉴权流**: 启动时 `restoreSession()` 恢复会话 → 未登录显示登录表单 → 登录后进入主界面
2. **域切换**: 通过 `activeDomain` 状态条件渲染四个域屏幕（不使用 React Navigation）
3. **抽屉导航**: 左侧动画抽屉，展示当前域对应的列表（聊天列表 / 终端会话 / 智能体列表）
4. **WebSocket 推送**: 连接 `/api/app/ws`，处理 `inbox.new` / `chat.new_content` 等实时事件
5. **鉴权广播**: 管理 `authTokenSignal`，通过 `WebViewAuthRefreshCoordinator` 统一协调 WebView 鉴权刷新
6. **前台保活**: App 回到 `active` 时预刷新 token (debounce 20s) + 每 60s 定时刷新
7. **消息盒子**: 收件箱 UI + 未读数 badge
8. **发布中心**: 智能体发布面板（agents 域）

四个域屏幕：

| 域 | 组件 | 文件 |
|----|------|------|
| `chat` | `ChatAssistantScreen` | `src/modules/chat/screens/ChatAssistantScreen.tsx` |
| `terminal` | `TerminalScreen` | `src/modules/terminal/screens/TerminalScreen.tsx` |
| `agents` | `AgentsScreen` | `src/modules/agents/screens/AgentsScreen.tsx` |
| `user` | `UserSettingsScreen` | `src/modules/user/screens/UserSettingsScreen.tsx` |

### 状态管理

Redux Toolkit，5 个 slice + 3 个 RTK Query API。

**Redux Slices:**

| Slice | 文件 | State 关键字段 |
|-------|------|----------------|
| `shell` | `src/app/shell/shellSlice.ts` | `drawerOpen` |
| `user` | `src/modules/user/state/userSlice.ts` | `themeMode`, `endpointInput`, `ptyUrlInput`, `selectedAgentKey`, `activeDomain`, `booting` |
| `agents` | `src/modules/agents/state/agentsSlice.ts` | `agents[]`, `selectedAgentKey`, `loading`, `error` |
| `chat` | `src/modules/chat/state/chatSlice.ts` | `chats[]`, `chatId`, `chatKeyword`, `statusText`, `loadingChats` |
| `terminal` | `src/modules/terminal/state/terminalSlice.ts` | `ptyReloadKey`, `ptyLoading`, `activeSessionId`, `openNewSessionNonce` |

**RTK Query APIs:**

| API | 文件 | Endpoints |
|-----|------|-----------|
| `chatApi` | `src/modules/chat/api/chatApi.ts` | `getChats`, `getChat`, `getViewportHtml`, `submitFrontendTool` |
| `agentsApi` | `src/modules/agents/api/agentsApi.ts` | `getAgents` |
| `terminalApi` | `src/modules/terminal/api/terminalApi.ts` | `listTerminalSessions`, `createTerminalSession` |

所有 RTK Query API 使用 `fakeBaseQuery()` + 自定义 `queryFn` 模式（因为需要走 `authorizedFetch` / `getAccessToken` 等自定义鉴权逻辑）。

**Typed Hooks:** `useAppDispatch` / `useAppSelector`（`src/app/store/hooks.ts`）

**重要**: 聊天时间线数据（`timeline[]`、`planState`、`activeFrontendTool` 等）存储在 `ChatAssistantScreen` 组件本地 state，不在 Redux 中。通过 `eventReducer.ts` 的纯函数构建。

### 核心基础设施 (src/core/)

#### 鉴权 (`core/auth/appAuth.ts`)

- `loginWithMasterPassword(baseUrl, password, deviceName)` — 登录
- `restoreSession(baseUrl)` — 从 `deviceToken` 恢复会话
- `getAccessToken(baseUrl, forceRefresh?)` — 获取有效 token（自动刷新）
- `ensureFreshAccessToken(baseUrl, options?)` — 预刷新（阈值 90s + 抖动 8s）
- `authorizedFetch(baseUrl, path, options?)` — 带鉴权的 fetch（401 自动重试一次）
- `subscribeAuthSession(listener)` — 监听 session 变化
- `logoutCurrentDevice(baseUrl)` — 登出

Session 状态: `{ username, deviceId, deviceName, accessToken, accessExpireAtMs, deviceToken }`

单飞机制: `refreshingPromise` 确保并发刷新请求只执行一次网络调用。

#### 网络 (`core/network/`)

**apiClient.ts:**
- `fetchApiJson<T>(baseUrl, path, options?)` — 带鉴权 fetch + `ApiEnvelope<T>` 解析（code=0 成功）
- `fetchAuthedJson<T>(baseUrl, path, options?)` — 带鉴权 fetch，直接返回 JSON payload
- `fetchViewportHtml(baseUrl, viewportKey)` — 获取 Frontend Tool HTML（多种响应格式兼容）
- `submitFrontendToolApi(baseUrl, payload)` — 提交 Frontend Tool 结果
- `parseApiEnvelope<T>(response, bodyText)` — 解析 `{ code, msg, data }` 信封

**endpoint.ts:**
- `toBackendBaseUrl(endpointInput)` — 规范化后端 URL（内网 IP → `http://`，公网 → `https://`）
- `looksLikeLocalAddress(host)` — 检测内网地址
- `toDefaultPtyWebUrl(endpointInput)` — 生成默认 PTY 地址（内网端口 11931，公网 443）

#### 持久化 (`core/storage/settingsStorage.ts`)

- Storage key: `mobile_app_settings_v3`
- 启动时清理旧 key（`v1`, `v2`, 旧 device token）
- `loadSettings()` / `saveSettings()` / `patchSettings(partial)`
- `AppSettings`: `{ themeMode, endpointInput, ptyUrlInput, selectedAgentKey, activeDomain }`

#### 类型 (`core/types/common.ts`)

关键公共类型:
- `ThemeMode` = `'light' | 'dark'`
- `DomainMode` = `'chat' | 'terminal' | 'agents' | 'user'`
- `Agent` = `{ key?, id?, name?, ... }`
- `ChatSummary` = `{ chatId?, chatName?, title?, firstAgentKey?, firstAgentName?, updatedAt?, ... }`
- `AppSettings` = `{ themeMode, endpointInput, ptyUrlInput, selectedAgentKey, activeDomain }`
- `ApiEnvelope<T>` = `{ code: number, msg?: string, data: T }`
- `FrontendSubmitMessage` / `ToolInitMessage` — WebView 消息类型

### 主题系统 (`core/constants/theme.ts`)

- `THEMES.light` / `THEMES.dark` 定义完整调色板
- `AppTheme` 类型导出
- 主题通过 props 向下传递（不使用 React Context）
- 字体: iOS `Avenir Next` / Android `sans-serif`，等宽 `Menlo` / `monospace`

## 模块结构约定

每个业务域遵循统一目录结构：

```
modules/[domain]/
├── api/          # RTK Query 端点
├── services/     # 业务逻辑（SSE 客户端、事件处理等）
├── state/        # Redux slice + selectors
├── screens/      # 顶层屏幕组件
├── components/   # 子组件
├── types/        # TypeScript 接口
├── utils/        # 工具函数
├── webview/      # WebView 注入 HTML（仅 agents 模块）
└── __tests__/    # Jest 测试
```

## 聊天域详细架构

聊天是最复杂的模块，以下是完整的技术实现。

### 聊天时间线类型 (`modules/chat/types/chat.ts`)

```typescript
type TimelineEntry = MessageEntry | ToolEntry | ActionEntry | ReasoningEntry;

interface MessageEntry  { kind: 'message';   role: 'user'|'assistant'|'system'; text: string; isStreamingContent?: boolean; }
interface ToolEntry      { kind: 'tool';      label: string; argsText: string; resultText: string; state: 'init'|'running'|'done'|'failed'; }
interface ActionEntry    { kind: 'action';    actionName: string; argsText: string; resultText: string; state: 'init'|'running'|'done'|'failed'; }
interface ReasoningEntry { kind: 'reasoning'; text: string; collapsed: boolean; }
```

### SSE 流式客户端 (`modules/chat/services/chatStreamClient.ts`)

- 使用 `XMLHttpRequest` 实现 SSE（非浏览器 EventSource，因为 RN 环境限制 + 需要 POST）
- `POST /api/query` 发起，响应为 `text/event-stream`
- 每个 SSE 块格式: `data: {JSON}\n\n`
- 解析入口: `parseSseBlock()` → 逐块解析 → `applyEvent()` 分发

### 事件归一化 (`modules/chat/services/eventNormalizer.ts`)

将后端原始事件统一为标准格式，处理字段名差异和类型映射。

### 事件 Reducer (`modules/chat/services/eventReducer.ts`)

核心纯函数: `reduceChatEvent(prevState, event, source, runtime) → { nextState, effects }`

**数据流:**

```
POST /api/query (SSE)
  → XMLHttpRequest onprogress
  → parseSseBlock()          # SSE 文本 → JSON
  → applyEvent()             # 路由: 设置 chatId、调用 reduceChatEvent
  → reduceChatEvent()        # 纯函数: 构建时间线
  → handleEffects()          # 副作用: set_chat_id / execute_action / stream_end / activate_frontend_tool
  → React setState()         # 触发 FlatList 重渲染
```

### Runtime Maps (`ChatRuntimeMaps`)

单次会话加载期间维护，映射后端 ID → 时间线条目 ID：

| Map | 用途 |
|-----|------|
| `contentIdMap` | `contentId` → `assistant:N` |
| `toolIdMap` | `toolId` → `tool:N` |
| `actionIdMap` | `actionId` → `action:N` |
| `reasoningIdMap` | `reasoningId` → `reasoning:N` |
| `actionStateMap` | `actionId` → 动作累积状态 `{ argsText, resultText, executed }` |
| `toolStateMap` | `toolId` → 工具累积状态 `{ argsBuffer, toolName, toolParams, ... }` |

### 副作用 (ChatEffect)

| 类型 | 触发时机 | 行为 |
|------|----------|------|
| `set_chat_id` | 任何携带 `chatId` 的事件 | 更新组件 chatId 状态 |
| `execute_action` | `action.end`（仅 live） | 执行动作业务逻辑 |
| `stream_end` | `run.complete` / `run.cancel` / `run.error` | 标记流结束 |
| `activate_frontend_tool` | `tool.start`/`tool.snapshot`（仅 live + Frontend Tool） | 激活 WebView |

### Frontend Tool 集成

- 后端通过工具调用返回 HTML 页面，嵌入聊天 WebView 中
- `ViewportBlockView.tsx` 渲染视口块
- `Composer.tsx` 管理输入框和 Frontend Tool WebView
- `frontendToolBridge.ts` 解析 WebView 消息 (`frontend_submit` / `auth_refresh_request`)
- 提交结果: `POST /api/submit { runId, toolId, params }`

### 历史加载 vs 实时流

| 维度 | 实时流 (`source='live'`) | 历史加载 (`source='history'`) |
|------|--------------------------|-------------------------------|
| 数据来源 | `POST /api/query` SSE | `GET /api/chat?chatId=` 事件数组 |
| 内容事件 | `content.start` → N 个 `content.delta` → `content.end` | `content.snapshot` |
| 工具参数 | `tool.start` → N 个 `tool.args` → `tool.end` | `tool.snapshot` |
| `isStreamingContent` | `true`（控制光标动画） | `false` |
| 副作用执行 | 执行 | 不执行（避免重放） |
| Frontend Tool | 激活 WebView | 不激活 |

### 计划栏 (Plan Bar)

双层更新模型:

| 层 | 事件 | 说明 |
|---|---|---|
| 内容层 | `plan.update` | 全量替换 `tasks[]` |
| 状态层 | `task.start` / `task.complete` / `task.fail` / `task.cancel` | 按 `taskId` 增量更新 `status` |

```typescript
interface PlanState { planId: string; tasks: PlanTask[]; expanded: boolean; lastTaskId: string; }
interface PlanTask  { taskId: string; description: string; status: 'init' | 'running' | 'done' | 'failed'; }
```

- `task.cancel` → `status = 'done'`（类型无 `'cancelled'`）
- 未知 `taskId` 自动追加新条目
- 最后一个任务完成后 1.5s 自动收起
- `cleanPlanTaskDescription()` (`utils/planUi.ts`): 清理 markdown/前缀，提取纯文本

## SSE 完整事件类型表

### 会话控制事件

| 事件类型 | 关键字段 | 说明 |
|----------|----------|------|
| `request.query` | `requestId`, `message` | 用户消息回显 |
| `chat.start` | — | 会话开始 |
| `run.start` | `runId` | 运行开始 |
| `run.complete` | `runId` | 运行正常结束 |
| `run.cancel` | `runId` | 运行被取消 |
| `run.error` | `error` | 运行出错 |

### 内容流事件

| 事件类型 | 关键字段 | 说明 |
|----------|----------|------|
| `content.start` | `contentId`, `text` | 助手内容开始 |
| `content.delta` | `contentId`, `delta` | 助手内容增量 |
| `content.end` | `contentId`, `text` | 助手内容结束 |
| `content.snapshot` | `contentId`, `text`/`content` | 助手内容快照（历史） |

### 推理事件

| 事件类型 | 关键字段 | 说明 |
|----------|----------|------|
| `reasoning.start` | `reasoningId`, `text` | 推理开始 |
| `reasoning.delta` | `reasoningId`, `delta` | 推理增量 |
| `reasoning.end` | `reasoningId` | 推理结束 |
| `reasoning.snapshot` | `reasoningId`, `text` | 推理快照（历史） |

### 工具调用事件

| 事件类型 | 关键字段 | 说明 |
|----------|----------|------|
| `tool.start` | `toolId`, `toolName`, `toolType`, `toolKey` | 工具调用开始 |
| `tool.args` | `toolId`, `delta` | 工具参数增量 |
| `tool.end` | `toolId`, `error`? | 工具调用结束 |
| `tool.params` | `toolId`, `toolParams` | 前端工具参数（HITL） |
| `tool.result` | `toolId`, `result`/`output` | 工具结果 |
| `tool.snapshot` | `toolId`, `arguments`, `toolParams` | 工具快照（历史） |

### 动作事件

| 事件类型 | 关键字段 | 说明 |
|----------|----------|------|
| `action.start` | `actionId`, `actionName` | 动作开始 |
| `action.args` | `actionId`, `delta` | 动作参数增量 |
| `action.end` | `actionId`, `error`? | 动作结束 |
| `action.result` | `actionId`, `result`/`output` | 动作结果 |
| `action.snapshot` | `actionId` | 动作快照（历史） |

### 计划事件

| 事件类型 | 关键字段 | 说明 |
|----------|----------|------|
| `plan.update` | `planId`, `plan[]` | 全量替换计划 |
| `task.start` | `taskId`, `description` | 任务开始 |
| `task.complete` | `taskId`, `status` | 任务完成 |
| `task.fail` | `taskId`, `error` | 任务失败 |
| `task.cancel` | `taskId` | 任务取消 |

## WebView 鉴权桥接协议

采用 "App 主动预刷新 + WebView 401 兜底刷新" 组合策略。

### 消息类型

| 消息类型 | 方向 | 字段 | 用途 |
|----------|------|------|------|
| `auth_token` | RN → WebView | `accessToken`, `accessExpireAtMs?` | 主动下发 token |
| `auth_refresh_request` | WebView → RN | `requestId`, `source` | WebView 401 请求刷新 |
| `auth_refresh_result` | RN → WebView | `requestId`, `ok`, `accessToken?`, `error?` | 刷新结果 |

### 代码锚点

| 职责 | 文件 |
|------|------|
| 协议定义与构造 | `src/core/auth/webViewAuthBridge.ts` |
| 刷新与会话管理 | `src/core/auth/appAuth.ts` |
| 统一协调与定时预刷新 | `src/app/shell/ShellScreen.tsx` |
| Terminal WebView 桥接 | `src/modules/terminal/components/TerminalWebView.tsx` |
| Chat Frontend Tool 桥接 | `src/modules/chat/components/Composer.tsx` / `ChatAssistantScreen.tsx` |

### 开发接入规则

1. **消息类型限定**: 仅 `auth_token` / `auth_refresh_request` / `auth_refresh_result` 三种，必须复用 `webViewAuthBridge.ts` 的构造/解析函数
2. **传输通道**: 基于 `react-native-webview` 的 `postMessage` 桥（非 HTTP），token 刷新仍由 RN 调 `/api/auth/refresh`
3. **RN 侧**: WebView 注入桥脚本 → `onMessage` 解析 → `WebViewAuthRefreshCoordinator.refresh()` 单飞 → 回写结果
4. **H5 侧**: 内存态 token → 401 触发 `auth_refresh_request` → 请求排队 → 收到结果后重放或清理
5. **安全**: 不把 token 落日志/localStorage/URL query

## 后端 API 协议

所有业务 API 统一 `ApiEnvelope<T>` 格式: `{ code: 0, msg?, data: T }`。鉴权: `Authorization: Bearer <accessToken>`。

### 鉴权 API

| 方法 | 端点 | 请求体 | 响应 |
|------|------|--------|------|
| POST | `/api/auth/login` | `{ masterPassword, deviceName }` | `{ username, deviceId, deviceName, accessToken, accessExpireAt, deviceToken }` |
| POST | `/api/auth/refresh` | `{ deviceToken }` | `{ deviceId, accessToken, accessExpireAt, deviceToken }` |
| POST | `/api/auth/logout` | — | — |

### 业务 API

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/agents` | 返回 `Agent[]` |
| GET | `/api/chats` | 返回 `ChatSummary[]` |
| GET | `/api/chat?chatId=...` | 返回 `{ events: ChatEvent[] }` |
| GET | `/api/viewport?viewportKey=...` | 返回 HTML（多种格式兼容） |
| POST | `/api/query` | SSE 流式响应（`text/event-stream`） |
| POST | `/api/submit` | `{ runId, toolId, params }` → `{ accepted, detail, status }` |

### 消息盒子 API

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/app/inbox?limit=N` | `InboxMessage[]` |
| GET | `/api/app/inbox/unread-count` | `{ unreadCount }` |
| POST | `/api/app/inbox/read` | `{ messageIds: string[] }` |
| POST | `/api/app/inbox/read-all` | — |

### WebSocket

`ws(s)://{host}/api/app/ws?access_token=...`

推送格式: `{ type: string, payload: { ... } }`

| type | payload | 说明 |
|------|---------|------|
| `inbox.new` | `{ message: InboxMessage, unreadCount? }` | 新消息 |
| `inbox.sync` | `{ unreadCount }` | 同步未读数 |
| `chat.new_content` | — | 聊天有新内容 |

### 终端 API

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `{ptyBase}/sessions` | `TerminalSessionItem[]` |
| POST | `{ptyBase}/sessions` | `{ sessionId, wsUrl?, startedAt? }` |

`ptyBase` = `{ptyWebUrl}/appterm/api`

## 样式约定

- `StyleSheet.create()` 定义样式，样式对象放在组件文件底部
- 主题通过 props 传递（`theme` prop），不使用 React Context
- `core/constants/theme.ts` 定义 `THEMES.light` / `THEMES.dark` 完整调色板
- 响应式布局: `useWindowDimensions()` hook
- 平台差异: iOS `KeyboardAvoidingView behavior="padding"`，Android 手动计算 `keyboardInset`

## 测试约定

- 测试文件: `__tests__/*.test.ts` / `__tests__/*.test.tsx`
- Jest 配置: `jest.config.js`，preset `jest-expo`
- 现有测试覆盖: eventReducer、eventNormalizer、chatStreamClient、planUi、format、fireworks、endpoint、settingsStorage、appAuth、webViewAuthBridge、frontendToolBridge、chatSelectors、Composer

## 关键编码模式

### RTK Query + fakeBaseQuery

```typescript
export const someApi = createApi({
  reducerPath: 'someApi',
  baseQuery: fakeBaseQuery(),
  endpoints: (builder) => ({
    getData: builder.query<ReturnType, ArgType>({
      async queryFn(arg) {
        try {
          const data = await fetchApiJson<ReturnType>(baseUrl, '/api/path');
          return { data };
        } catch (error) {
          return { error: error as Error };
        }
      }
    })
  })
});
```

### 工具函数命名

- `getAgentKey(agent)` / `getAgentName(agent)` — 安全提取 Agent 字段
- `getChatTitle(chat)` / `getChatAgentName(chat)` — 安全提取 Chat 字段
- `toHHMM()` / `toSmartTime()` / `formatChatListTime()` — 时间格式化
- `createRequestId(prefix?)` — 生成唯一请求 ID

### WebView 消息桥接模式

```typescript
// RN -> WebView
webViewRef.current?.injectJavaScript(buildWebViewPostMessageScript(payload));

// WebView -> RN (onMessage)
const message = parseFrontendToolBridgeMessage(event.nativeEvent.data);
if (message?.type === 'frontend_submit') { /* 处理提交 */ }
if (message?.type === 'auth_refresh_request') { /* 处理鉴权刷新 */ }
```

## 聊天详情页手势操作

`ChatAssistantScreen` 在时间线区域通过 `PanResponder` 实现四方向手势导航，手势识别互斥（同一时刻只激活一个方向）。

### 视觉模型 — 整页位移 + 背景提示

四方向手势统一采用 **整页内容位移，露出背后提示文字** 的视觉反馈：

```
<View container>
  {/* 背景提示层 (zIndex: 0) — 被 contentWrap 遮住 */}
  {createChatHintBehind}      -- 纵向 "新建对话" 文字，左边缘
  {switchPrevHintBehind}       -- "↑ 上一条对话"，顶部居中
  {switchNextHintBehind}       -- "下一条对话 ↓"，底部居中

  {/* 内容层 (zIndex: 1, backgroundColor, contentTransformStyle) */}
  <View contentWrap>
    <View timelineGestureLayer> <FlatList /> </View>
    {composerOuter}
  </View>

  {/* 浮层 (edgeToast, copyToast, fireworks, overlay, modal) */}
</View>
```

- `contentWrap` 带 `backgroundColor: theme.surface` + `zIndex: 1`，自然遮住背后提示
- 手势滑动时 `contentTransformStyle` 对 `contentWrap` 施加 `translateX`/`translateY`，内容移开后背景提示露出
- 右滑最大位移 52px（纵向 4 个汉字宽度），上下滑最大位移 52px

### 手势方向一览

| 方向 | 动作 | 触发条件 | 视觉反馈 |
|------|------|----------|----------|
| 右滑 | 新建对话 | 水平主导 + dx ≥ 112px + 起始点 x ≥ 32px | 整页右移，左边缘露出纵向"新建对话"文字 |
| 左滑 | 显示对话列表抽屉 | 水平主导 + -dx ≥ 96px 或速度 ≤ -0.58 | 抽屉 preview 线性跟手（0→96px 映射 0→1） |
| 下拉 | 切换到上一条对话 | 列表已滚到顶 + 垂直主导 + dy ≥ 72px | 整页下移，顶部露出"↑ 上一条对话"卡片 |
| 上拉 | 切换到下一条对话 | 列表已滚到底 + 垂直主导 + -dy ≥ 72px | 整页上移，底部露出"下一条对话 ↓"卡片 |

### 两阶段模型

每个方向手势分为 **reveal（预览）** 和 **commit（提交）** 两阶段：

1. **Reveal 阶段**：手指拖动超过 `REVEAL_THRESHOLD`（18px）后开始显示视觉反馈，距离映射到 `[0, 1]` progress
2. **Commit 阶段**：松手时若超过 `COMMIT_THRESHOLD` 则执行对应动作，否则回弹归位

### 上下滑滚动前提

- 长内容列表：上下滑手势**只在列表滚到边缘**时激活。滚到顶部时才能下拉切换，滚到底部时才能上拉切换
- 短内容列表（不可滚动）：直接支持上下滑切换
- 到达边缘时显示 edge toast 提示（"已到对话顶部"/"已到对话底部"），引导用户继续滑动切换

### 抽屉 preview 防闪烁

`ChatDetailDrawer` 通过两个独立 `useEffect` 分离手势驱动和状态驱动动画：
- **手势 effect**：只调用 `setValue()` 直接设值，不启动 `timing`/`spring`
- **状态 effect**：只在 `visible` 真正变化时才调用 `stopAnimation()` + 动画

### 特殊限制

- 流式回复中（`streaming = true`）或 Frontend Tool 活跃时，禁止上下切换对话
- 手势冷却时间 450ms，防止连续误触
