# 项目架构总览

## 1. 技术栈

- 框架：`Expo 56`
- 渲染层：`React Native 0.85`
- 语言：`TypeScript`
- 导航：`React Navigation Bottom Tabs`
- 高性能列表：`@shopify/flash-list`
- 本地持久化：
  - `expo-sqlite`
  - `drizzle-orm/expo-sqlite`
  - `react-native-mmkv`
- 实时通信：原生 `WebSocket`

## 2. 总体分层

项目按 `app / core / features / shared` 四层组织。

```text
App Entry
  -> app
     -> navigation
     -> screens
     -> debug

Business Foundation
  -> core
     -> config
     -> api

Feature Modules
  -> features
     -> chatPersistence
     -> chatRealtime

Reusable UI
  -> shared
     -> components
```

### 2.1 `app`

负责应用壳层：

- React Navigation 容器
- 底部 Tab 结构
- 页面入口挂载
- 开发环境调试浮层

### 2.2 `core`

负责跨业务通用能力：

- 读取运行时环境变量
- 统一 API 请求函数
- 统一接口目录约定

### 2.3 `features`

负责具备明确业务边界的功能模块：

- `chatPersistence`：聊天列表、消息、本地数据库、首页快照
- `chatRealtime`：WebSocket 连接与实时同步

### 2.4 `shared`

负责可复用 UI 组件。当前主要是高性能分页列表组件。

## 3. 当前目录结构

```text
src/
  app/
    AppRoot.tsx
    debug/
      DevelopmentDebugButton.tsx
    navigation/
      RootNavigator.tsx
      TabIcon.tsx
      types.ts
    screens/
      AppScreenFrame.tsx
      TabScreens.tsx
  core/
    api/
      apiClient.ts
      services/
        README.md
        templateApi.ts
    config/
      runtimeEnv.ts
  features/
    chatPersistence/
      ChatHomeStorageDemo.tsx
      chatRepository.ts
      database.ts
      homeSnapshot.ts
      schema.ts
      types.ts
    chatRealtime/
      chatSyncService.ts
      types.ts
      wsManager.ts
  shared/
    components/
      PaginatedCardList.tsx
```

## 4. 运行架构

### 4.1 应用启动链路

```text
App.tsx
  -> AppRoot
  -> NavigationContainer
  -> RootNavigator
  -> TabScreens
```

职责说明：

- `AppRoot` 负责导航主题和 `Debug` 按钮挂载
- `RootNavigator` 负责底部 Tab 配置
- `TabScreens` 决定各 Tab 具体渲染页面

### 4.2 Chat 首页启动链路

`Chat` Tab 当前挂的是一个完整样例页 `ChatHomeStorageDemo`，启动顺序如下：

```text
ChatHomeStorageDemo mount
  -> 读 MMKV 首页快照
  -> prepareChatPersistenceSample()
  -> 从 SQLite 读取第一页会话列表
  -> 从 SQLite 读取首个会话的消息预览
  -> chatSyncService.start()
```

设计目标：

- 首屏尽快有内容：MMKV 快照回显
- 真正数据来源统一：SQLite 覆盖快照
- 实时层独立：页面只订阅同步事件，不直接碰 socket

### 4.3 聊天数据分层

#### SQLite / Drizzle

SQLite 是唯一数据真源，负责：

- 会话摘要
- 全量消息
- 待补发消息 outbox

数据库表：

- `conversations`
- `messages`
- `outbox_messages`

#### MMKV

MMKV 只负责首页启动快照：

- 首屏第一页会话列表
- 最后一条消息摘要
- 未读数

它不负责：

- 全量消息历史
- 复杂查询
- 排序和去重真源

### 4.4 实时同步链路

```text
chatWsManager
  -> connect / reconnect / send / receive
  -> chatSyncService
     -> createOutgoingMessage
     -> markOutgoingMessageSent
     -> markOutgoingMessageFailed
     -> applyIncomingMessage
     -> emit UI sync events
```

职责切分：

- `chatWsManager`
  - 只关心底层 WebSocket
  - 维护连接状态
  - 自动重连
  - 在没有配置 WS 地址时退回 mock 模式
- `chatSyncService`
  - 负责把 socket 事件转成业务同步动作
  - 负责首连/重连时 flush outbox
  - 负责乐观发送后的 ack 落库
- `chatRepository`
  - 是本地数据写入口
  - 统一更新 SQLite 与首页快照

### 4.5 发送消息链路

```text
UI 点击发送
  -> chatSyncService.sendMessage()
  -> chatRepository.createOutgoingMessage()
     -> 写 messages(pending)
     -> 写 outbox_messages
     -> 更新 conversations 摘要
     -> 刷新 MMKV 首页快照
  -> wsManager.send()
  -> 等待 ack
  -> markOutgoingMessageSent()
```

特点：

- 本地先落库，保证重启后不丢待发送消息
- UI 先看到 `pending` 状态
- 收到 ack 后更新成 `sent`

### 4.6 收到服务端消息链路

```text
wsManager.onmessage
  -> chatSyncService.handleSocketEvent()
  -> chatRepository.applyIncomingMessage()
     -> 去重
     -> 必要时自动补建会话壳
     -> 写 messages
     -> 更新 conversations 摘要和未读数
     -> 刷新 MMKV 首页快照
  -> 页面收到同步事件后重新读取可见数据
```

### 4.7 列表组件链路

通用列表组件 `PaginatedCardList` 基于 `FlashList` 实现，负责：

- 下拉刷新
- 自动上拉加载更多
- 底部 loading
- 滚动超过一屏后显示右下角返回顶部按钮
- 固定项高度透传，便于 `FlashList` 预估渲染

## 5. 模块边界约束

### 5.1 当前约束

- 页面不直接操作 SQLite
- 页面不直接操作 WebSocket
- `MMKV` 不保存完整消息库
- `SQLite` 才是最终排序和状态判断依据

### 5.2 当前仍是样例/骨架的部分

- `Terminal` Tab 仍是占位页
- `Drive` Tab 仍是占位页
- `Me` Tab 仍是占位页
- 聊天实时协议仍以 demo/mock 结构为主
- 还没有接真实后端聊天接口

## 6. 环境变量

当前会读取的公开环境变量：

- `EXPO_PUBLIC_API_BASE_URL`
- `EXPO_PUBLIC_CHAT_WS_URL`

规则：

- 如果配置了 `EXPO_PUBLIC_CHAT_WS_URL`，实时层直接使用它
- 如果没配，则尝试从 `EXPO_PUBLIC_API_BASE_URL` 推导 `/ws/chat`
- 如果都没有，则进入 mock 模式

## 7. 扩展建议

推荐后续按下面方向扩展，而不是打破当前分层：

- 在 `src/core/api/services/` 下新增真实业务接口文件
- 为聊天详情页新增独立 screen，而不是继续堆在 demo 页里
- 在 `chatRepository` 上继续加读取和状态更新能力
- 把 mock 协议替换成真实 WS 协议时，优先保持 `chatSyncService` 接口不变
