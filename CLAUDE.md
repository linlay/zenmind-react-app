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

AsyncStorage 存储应用设置，key 为 `agw_mobile_app_settings_v2`。应用启动时自动从 v1 迁移。

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
| 状态层 | `task.start` / `task.complete` / `task.end` / `task.fail` / `task.cancel` | 增量更新：按 `taskId` 定位单条任务，修改其 `status` |

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
  status: 'pending' | 'running' | 'done' | 'failed';
}
```

### 事件处理流程

1. `plan.update` → 全量替换 `tasks`，通过 `normalizePlanTask()` 归一化
2. `task.start` → 设置 `status = 'running'`
3. `task.complete` / `task.end` → 设置 `status = normalizeTaskStatus()` 结果（通常为 `'done'`）
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
| `chat.start` | — | 会话开始，无需处理 |
| `run.start` | `runId` | 运行开始，记录 runId |
| `run.complete` | `runId` | 运行正常结束 |
| `run.cancel` | `runId` | 运行被取消 |
| `run.error` | `error` | 运行出错 |
| `request.query` | `requestId`, `message` | 用户消息回显 |

#### 内容流事件

| 事件类型 | 关键字段 | 说明 |
|----------|----------|------|
| `content.start` | `contentId`, `text` | 助手内容开始 |
| `content.delta` | `contentId`, `delta` | 助手内容增量 |
| `content.snapshot` | `contentId`, `text` / `content` | 助手内容快照（历史加载） |
| `content.end` | `contentId`, `text` | 助手内容结束 |

#### 推理事件

| 事件类型 | 关键字段 | 说明 |
|----------|----------|------|
| `reasoning.start` | `reasoningId`, `text` | 推理开始 |
| `reasoning.delta` | `reasoningId`, `delta` | 推理增量 |
| `reasoning.end` | `reasoningId` | 推理结束 |

#### 工具调用事件

| 事件类型 | 关键字段 | 说明 |
|----------|----------|------|
| `tool.start` | `toolId`, `toolName`, `toolType`, `toolKey` | 工具调用开始 |
| `tool.snapshot` | `toolId`, `arguments`(JSON 字符串), `toolParams`(对象) | 工具快照（历史加载携带完整参数） |
| `tool.args` | `toolId`, `delta` | 工具参数增量流 |
| `tool.result` | `toolId`, `result` / `output` | 工具执行结果 |
| `tool.end` | `toolId`, `error`(可选) | 工具调用结束 |

#### 动作事件

| 事件类型 | 关键字段 | 说明 |
|----------|----------|------|
| `action.start` | `actionId`, `actionName` | 动作开始 |
| `action.snapshot` | `actionId` | 动作快照 |
| `action.args` | `actionId`, `delta` | 动作参数增量 |
| `action.result` | `actionId`, `result` / `output` | 动作结果 |
| `action.end` | `actionId`, `error`(可选) | 动作结束，触发 `execute_action` 副作用 |

#### 计划事件

| 事件类型 | 关键字段 | 说明 |
|----------|----------|------|
| `plan.update` | `planId`, `plan[]` | 全量替换计划任务列表 |
| `task.start` | `taskId`, `description` | 单任务开始执行 |
| `task.complete` | `taskId`, `status` | 单任务完成 |
| `task.end` | `taskId`, `status` | 单任务结束 |
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
