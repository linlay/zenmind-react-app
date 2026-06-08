# 模块说明清单

## 1. 应用壳层 `src/app`

### `AppRoot.tsx`

职责：

- 创建 `NavigationContainer` 并注入统一导航主题。
- 启动认证 bootstrap，按前台状态预刷新 access token。
- 根据 session 注册通知并启停 `chatSyncService`。
- 接收通知点击 payload，必要时先缓存，待认证与导航 ready 后进入 `ChatDetail`。
- 在开发态挂载 `DevelopmentDebugPanelHost`。

### `startup/AppLaunchSkeleton.tsx`

职责：

- 承接 native splash 之后的 React 启动加载遮罩。
- 提供品牌 logo 入场、最短展示时长和退场动画。
- 只处理显示时序，不承担业务数据初始化。

### `debug/DevelopmentDebugPanelHost.tsx`

职责：

- 开发态调试面板宿主，默认隐藏。
- Me 页版本信息三连点通过 `developmentDebugPanel.ts` 打开。
- 展示 API Base URL、reload、本地聊天缓存 reset、WS frame ring buffer 等调试能力。
- 通过 `chatSyncService` 暴露的开发态入口清缓存，不直接读写 SQLite、MMKV 或 WebSocket。

### `navigation/RootNavigator.tsx`

职责：

- 配置登录门卫、root stack、底部 Tab 和 `ChatDetail` 上层 route。
- 根据认证状态显示 `AuthBootstrapScreen`、`LoginScreen` 或主应用 Tabs。
- 控制底部栏 safe area、图标、标签、样式和键盘避让。

当前 Tab：

- `Chat`：对话
- `Terminal`：任务
- `Drive`：网盘
- `Me`：用户

### `navigation/TabIcon.tsx`

职责：

- 将 Tab route 映射到共享 `AppIcon` 使用位。
- 提供中文 Tab 标签。

### `screens/TabScreens.tsx`

职责：

- 作为 Tab 与具体页面之间的映射层。
- `Chat` 映射到 `ChatHomeStorageDemo`。
- `Terminal` 映射到 `AgentTaskBoardScreen`。
- `Drive` 暂用占位页。
- `Me` 展示用户、会话、设备、版本和退出登录入口。

## 2. 基础能力层 `src/core`

### `config/runtimeEnv.ts`

职责：

- 统一读取 `EXPO_PUBLIC_*` 公开环境变量。

### `config/endpoint.ts`

职责：

- 规范化 API base URL。
- 内网地址和 localhost 默认使用 `http://`，公网域名默认使用 `https://`。

### `api/apiClient.ts`

职责：

- 提供 `getApiBaseUrl()`、`buildApiUrl()`、`apiRequest<T>()`、`authenticatedApiRequest<T>()`。
- 统一附加 access token，401 后尝试刷新再重试。
- 统一记录 HTTP debug request / response / error。

### `api/services/*`

职责：

- 按业务能力组织 API 函数。
- 当前包含 chat、chat event protocol、notification、upload 和 template。

### `auth/appAuth.ts`

职责：

- 登录、登出、刷新 access token。
- 持久化 device token 与 session snapshot。
- 为请求侧提供 `getAccessTokenForRequest()`。

### `auth/authConfig.ts`

职责：

- 保存和读取登录页配置的 API base URL。
- 提供认证门卫开关 `isAuthRequired()`。

### `auth/useAuthSession.ts`

职责：

- 订阅认证 session snapshot。
- 供 `AppRoot`、`RootNavigator`、Me 页等 UI 使用。

## 3. 功能模块 `src/features`

### `auth/LoginScreen.tsx`

职责：

- 认证 bootstrap 页面和登录页。
- 收集后端域名/IP、用户名、主密码和设备名。
- 成功后保存 API base URL 并建立 session。

### `agentTaskBoard/AgentTaskBoardScreen.tsx`

职责：

- Terminal/任务 Tab 的移动端 AI 任务看板设计稿。
- 用本地 mock 数据展示今日处理、队列筛选、新建任务、分配任务和任务详情流程。
- 当前不接入持久化或实时 transport。

### `chatPersistence`

职责：

- 维护 Chat 首页目录、会话摘要、消息、outbox、read state、conversation sync state、rich timeline snapshot、本地数据库和 MMKV 目录快照。
- 提供 Chat 首页与详情页 UI 入口。
- 作为 SQLite / MMKV 的统一 repository 边界。

主要入口：

- `ChatHomeStorageDemo.tsx`：Chat 首页目录、冷启动回显、分页、置顶折叠、新对话入口。
- `ChatDetailScreen.tsx`：详情页组合入口。
- `chatRepository.ts`：本地读写唯一入口。
- `chatDirectoryProjector.ts`：把远端 agents / teams / chats 投影为首页目录和会话摘要。
- `chatProjector.ts`：把远端会话详情投影为 summary、messages、runtime state 和 timeline state。
- `chatReadState.ts`：归一 read / unread 字段。
- `homeSnapshot.ts`：MMKV 首页目录快照。
- `database.ts` / `schema.ts`：SQLite / Drizzle 数据库和表结构。

边界：

- 页面只能通过 repository 或 sync service 取数和写入。
- 影响首页目录的写入必须刷新 MMKV 目录快照。
- 空 conversation 不抢占目录 `latest_conversation_id`。

### `chatTimeline`

职责：

- 维护 Chat 详情页同一份 `ChatTimelineState`。
- 归一用户消息、assistant 内容、reasoning、planning、tool、artifact、awaiting、usage、run lifecycle 等节点。
- 提供序列化 / 反序列化能力，供 repository 存入 normalized rich timeline snapshot。

主要入口：

- `timelineReducer.ts`
- `timelinePersistence.ts`
- `timelineDisplay.ts`
- `messageProjection.ts`
- `usageSummary.ts`

### `chatRealtime`

职责：

- 管理 `/ap/ws` 连接、request、stream、push、重连、outbox replay 和 scoped sync event。
- 把实时帧转成 timeline state 与 repository patch / upsert / reconcile。
- 提供发送、停止、继续、awaiting question submit、mark read 和开发态 reset 入口。

主要入口：

- `chatSyncService.ts`：UI 侧业务同步入口。
- `chatWsTransport.ts`：把 API base URL 和 access token 适配到 `/ap/ws`。
- `wsClient.ts`：底层 WebSocket client。
- `runtimeState.ts`：运行态归一辅助。
- `wsDebugRecorder.ts`：开发态 WS frame ring buffer。

边界：

- `chatWsTransport` 和 `WsClient` 不读写 SQLite、MMKV 或 UI 状态。
- 所有业务写入继续走 `chatSyncService` 和 `chatRepository`。

### `notifications/notificationService.ts`

职责：

- 原生平台通知权限、Android channel、push token 获取与后端注册。
- 解析 `chat.message` 点击 payload。
- 记录 active conversation，避免当前会话重复弹通知。
- 将通知点击交给 `AppRoot` 统一转导航动作。

## 4. 共享层 `src/shared`

### `visual/foundation.ts`

职责：

- 提供移动端唯一视觉 token 入口。
- 管理背景、表面、文本、分隔线、圆角、阴影、状态色、头像色板和间距语义。

### `components/ScreenHeader.tsx`

职责：

- 统一一级页面和详情页 Header 的标题、左右操作区和视觉结构。

### `components/PaginatedCardList.tsx`

职责：

- 提供基于 `FlashList` 的分页列表容器。
- 支持刷新、触底加载、顶部 / 底部 loading、返回顶部、空状态和稳定估算尺寸。

### `components/ConversationMarkdownRenderer.tsx`

职责：

- 共享 Markdown 渲染 wrapper。
- 基于 `react-native-enriched-markdown` 和 `react-native-streamdown` 渲染 native Markdown、GFM table、LaTeX 和流式内容。
- 不夹带业务仓储、鉴权或下载逻辑。

### `icons/*`

职责：

- 提供统一图标组件、图标按钮、品牌资源和使用 registry。
- Tab、Header、占位页和辅助操作统一从 registry 取图标语义。

## 5. 当前模块关系

```text
AppRoot
  -> RootNavigator
  -> useAuthSession / appAuth
  -> notificationService
  -> chatSyncService

ChatHomeStorageDemo
  -> chatRepository
  -> chatSyncService
  -> PaginatedCardList

ChatDetailScreen
  -> useChatDetailConversationController
  -> chatRepository
  -> chatSyncService
  -> ChatTimelineList
  -> ChatAwaitingDock

chatSyncService
  -> chatWsTransport / WsClient
  -> chatRepository
  -> feature-chat-timeline

chatRepository
  -> database / schema
  -> homeSnapshot
  -> timelinePersistence

shared
  -> UI / icons / markdown / visual tokens only
```

## 6. 新增代码建议

- 新业务请求：放到 `src/core/api/services/`。
- 新聊天本地读写：优先扩展 `chatRepository.ts`。
- 新实时协议处理：优先扩展 `chatSyncService.ts` 或 `chatWsTransport.ts`，不要让 screen 直连 WebSocket。
- 新 timeline 节点：先扩展 `feature-chat-timeline`，再让详情页消费派生后的展示数据。
- 新通用 UI：优先放到 `src/shared`，并避免依赖业务模块。
- 新页面入口：从 `RootNavigator.tsx`、`TabScreens.tsx` 和 navigation types 同步接入。
