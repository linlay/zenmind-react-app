# 项目架构总览

## 1. 技术栈

- 框架：`Expo 56`
- 渲染层：`React Native 0.85`
- 语言：`TypeScript 6`
- 导航：`React Navigation` root stack + bottom tabs
- 高性能列表：`@shopify/flash-list`
- 本地持久化：`expo-sqlite`、`drizzle-orm`、`react-native-mmkv`
- 实时通信：`WebSocket`，默认连接后端 `/ap/ws`
- 系统通知：`expo-notifications`
- Markdown：`react-native-enriched-markdown`、`react-native-streamdown`
- 动画：`react-native-reanimated`、`react-native-worklets`

## 2. 总体分层

项目按 `app / core / features / shared` 四层组织。

```text
App Entry
  -> App.tsx
  -> app
     -> startup
     -> navigation
     -> screens
     -> debug

Core Foundation
  -> core
     -> api
     -> auth
     -> config
     -> debug

Feature Modules
  -> features
     -> auth
     -> chatPersistence
     -> chatRealtime
     -> chatTimeline
     -> notifications
     -> agentTaskBoard

Reusable UI
  -> shared
     -> components
     -> icons
     -> markdown
     -> visual
```

### 2.1 `app`

负责应用壳层：

- native splash 与 React 启动遮罩接棒
- `NavigationContainer`、root stack 和底部 Tab
- 认证门卫下的登录页 / Tabs 切换
- 系统通知点击后的导航路由
- 开发态 Debug 面板宿主

### 2.2 `core`

负责跨业务基础能力：

- API base URL 读取与规范化
- `authenticatedApiRequest()` 和统一 HTTP debug logging
- access token / device token 会话恢复与刷新
- 运行时公开环境变量读取

### 2.3 `features`

负责有明确业务边界的功能：

- `auth`：登录页和认证 bootstrap UI
- `chatPersistence`：Chat 首页、详情页、本地数据库、目录快照、rich timeline 持久化
- `chatRealtime`：`/ap/ws` 连接、request / stream / push、outbox replay、scoped sync event
- `chatTimeline`：reasoning、tool、awaiting、usage、run lifecycle 等 timeline 状态归一
- `notifications`：push token 注册、通知点击 payload、active conversation 抑制
- `agentTaskBoard`：任务 Tab 的移动端 AI 任务看板设计稿

### 2.4 `shared`

负责可复用能力：

- `ScreenHeader`、`PaginatedCardList`
- `AppIcon` / `AppIconButton` 和使用 registry
- `ConversationMarkdownRenderer` 与 Markdown 预处理
- `appVisualTokens`、头像和内建图标视觉 token

## 3. 应用启动链路

```text
index.js
  -> registerRootComponent(App)
  -> App.tsx
     -> SafeAreaProvider
     -> AppLaunchSkeleton
     -> AppRoot
        -> NavigationContainer
        -> RootNavigator
```

`App.tsx` 负责 `expo-splash-screen` handoff 和 React 启动遮罩退场时机。`AppRoot` 挂载导航容器、启动认证恢复、管理前台 access token 预刷新、订阅通知点击、按 session 启停 `chatSyncService`，并在开发态挂载 `DevelopmentDebugPanelHost`。

## 4. 导航结构

```text
RootStack
  -> Login
  -> Tabs
     -> Chat
     -> Terminal
     -> Drive
     -> Me
  -> ChatDetail
```

| Route / Tab | 实际入口 | 说明 |
| ----------- | -------- | ---- |
| `Login` | `src/features/auth/LoginScreen.tsx` | 认证冷启动和登录页 |
| `Chat` | `src/features/chatPersistence/ChatHomeStorageDemo.tsx` | Chat 首页目录 |
| `Terminal` | `src/features/agentTaskBoard/AgentTaskBoardScreen.tsx` | 任务 Tab / AI 任务看板 |
| `Drive` | `src/app/screens/TabScreens.tsx` | 网盘占位页 |
| `Me` | `src/app/screens/TabScreens.tsx` | 用户、会话和版本信息 |
| `ChatDetail` | `src/features/chatPersistence/ChatDetailScreen.tsx` | Tabs 之上的详情页 route |

底部 Tab 的真实 safe area / tab bar height 由导航层和页面容器协同处理，页面内不要硬编码底栏避让。

## 5. 聊天数据分层

### SQLite / Drizzle

SQLite 是本地真源，覆盖：

- 首页目录 `chat_directory_items`
- 会话摘要 `conversations`
- 消息 `messages`
- 待补发 `outbox_messages`
- 同步状态 `conversation_sync_state`
- rich timeline snapshot `conversation_timeline_meta` / `conversation_timeline_nodes`

### MMKV

MMKV 只保存首页首屏目录快照，用于冷启动回显。它不承担完整消息历史、排序、去重或 read state 真源职责。

### Repository

`chatRepository` 是本地数据统一读写入口，负责 SQLite 事务、目录投影、会话摘要 patch、outbox、通知补拉落库、timeline snapshot 持久化和目录快照刷新。

## 6. Chat 首页冷启动链路

```text
ChatHomeStorageDemo mount
  -> readChatDirectorySnapshot()
  -> prepareChatPersistenceSample()
  -> getChatDirectorySlice()
  -> chatSyncService.start()
  -> home.directory.replace / home.item.patch
```

设计目标：

- 首屏先用 MMKV 快照回显。
- SQLite 读取覆盖快照并作为真源。
- 首页只消费 scoped sync event，不直接碰 socket 或数据库底层。
- 首页失焦时暂停消费实时目录事件，恢复聚焦后补一次可见切片刷新。

## 7. Chat 详情与 Timeline

`ChatDetailScreen` 负责页面组合，具体加载、发送、停止、继续、awaiting question 提交、输入区主操作、运行态和用量派生收敛到 hook 与展示组件：

- `useChatDetailConversationController`
- `useChatDetailAwaitingOverlay`
- `useChatDetailLocalUiState`
- `ChatTimelineList`
- `ChatAwaitingDock`
- `ChatDetailComposerCard`
- `ChatDetailHeader`

详情页主消息、头部运行状态、输入区主操作和 usage 都从同一份 `ChatTimelineState` 派生。旧的 message/runtime event 仅保留兼容信号，不应在页面层维护第二套状态。

## 8. 实时同步链路

```text
chatSyncService
  -> chatWsTransport
     -> WsClient
        -> /ap/ws
  -> chatRepository
  -> feature-chat-timeline
  -> scoped UI sync events
```

职责切分：

- `WsClient`：底层 WebSocket、request、stream、push、心跳和重连。
- `chatWsTransport`：把 access token 和 API base URL 适配到 `/ap/ws`，并暴露 query / attach / request。
- `chatSyncService`：业务协调层，处理 outbox replay、发送、ack、incoming、summary push、read/unread、awaiting submit、stop/resume、reconcile 和 UI event。
- `chatRepository`：所有 SQLite / MMKV 写入入口。

正式路径不把缺失 WS URL 当 mock fallback；开发态可用 `EXPO_PUBLIC_CHAT_WS_URL` 覆盖 WebSocket 地址。

## 9. 发送消息链路

```text
UI send
  -> chatSyncService.sendMessage()
  -> chatRepository.createOutgoingMessage()
     -> messages(pending)
     -> outbox_messages
     -> conversations summary
     -> chat_directory_snapshot_v1
  -> chatWsTransport.streamChatQuery(/api/query)
  -> ack / stream event
  -> patchMessageByClientMessageId()
  -> ChatTimelineState replace
```

本地先落库，保证重启后不丢 pending 消息。ack、done 或 error 必须回到 repository patch，不能只改 UI。

## 10. 收到服务端消息链路

```text
WsClient push / stream event
  -> chatWsTransport normalize
  -> chatSyncService route
  -> feature-chat-timeline update
  -> chatRepository patch / upsert / reconcile
  -> scoped event to home or detail
```

summary push、`chat.read`、`chat.unread`、`chat.read_all` 只更新 repository 真源和目录投影，不在 service 或页面内维护第二套未读计数。

## 11. 系统通知链路

```text
session ready
  -> notificationService.registerForSession()
  -> registerPushTokenApi()

notification tap
  -> notificationService payload
  -> AppRoot pending payload if auth/navigation not ready
  -> RootStack.navigate('ChatDetail')
  -> repository local lookup by serverMessageId
  -> miss: fetch detail and idempotent upsert
```

移动端不承担通知投递队列；只处理权限、push token 注册、点击 payload 和按需补拉。

## 12. 环境变量

当前公开环境变量：

- `EXPO_PUBLIC_API_BASE_URL`
- `EXPO_PUBLIC_CHAT_WS_URL`（仅开发态 WS override）

API base URL 优先读取登录页保存到 MMKV 的地址，未配置时回退到 `EXPO_PUBLIC_API_BASE_URL`。

## 13. 模块边界约束

- 页面不直接操作 SQLite、MMKV 或底层 WebSocket。
- `shared` 不依赖聊天业务模块。
- `chatWsTransport` / `WsClient` 不直接写 UI 或 SQLite。
- SQLite 是聊天目录、摘要、消息、outbox 和 read state 真源。
- MMKV 只保存首页冷启动目录快照。
- 影响首页目录的写入必须刷新 `chat_directory_snapshot_v1`。
