# 模块说明清单

## 1. 应用壳层 `src/app`

### `AppRoot.tsx`

职责：

- 创建 `NavigationContainer`
- 注入统一导航主题
- 在开发环境挂载 `DevelopmentDebugButton`

备注：

- 这是应用内 UI 树的实际根节点

### `debug/DevelopmentDebugButton.tsx`

职责：

- 在 `__DEV__` 下显示右下角悬浮 `Debug` 按钮
- 打开调试说明弹层
- 原生端支持触发 `DevSettings.reload()`
- 显示当前 `API Base URL`

适用场景：

- 真机调试
- 排查开发态 warning
- 快速确认环境变量是否生效

### `navigation/RootNavigator.tsx`

职责：

- 配置底部 Tab 导航
- 关闭 Header
- 控制底部栏样式和图标渲染

当前 Tab：

- `Chat`
- `Terminal`
- `Drive`
- `Me`

### `navigation/TabIcon.tsx`

职责：

- 提供 4 个 Tab 的自绘图标
- 使用统一的圆润实心视觉风格

实现特点：

- 不依赖额外图标库
- 使用 `View + StyleSheet` 组合绘制

### `navigation/types.ts`

职责：

- 定义 `RootTabParamList`
- 约束底部 Tab 路由名称与参数类型

### `screens/AppScreenFrame.tsx`

职责：

- 为占位页面提供统一的固定 Header + 平面内容骨架布局

当前使用者：

- `Terminal`
- `Drive`
- `Me`

### `screens/TabScreens.tsx`

职责：

- 作为 Tab 和具体页面之间的映射层

当前映射：

- `Chat` -> `ChatHomeStorageDemo`
- 其他 Tab -> `AppScreenFrame`

## 2. 基础能力层 `src/core`

### `config/runtimeEnv.ts`

职责：

- 统一读取公开环境变量

当前用途：

- REST API Base URL
- WebSocket URL

### `api/apiClient.ts`

职责：

- 提供统一的 `apiRequest<T>()`
- 拼接 base URL、path、query
- 统一解析响应与错误

核心输出：

- `getApiBaseUrl()`
- `buildApiUrl()`
- `apiRequest<T>()`
- `ApiError`

### `api/services/README.md`

职责：

- 约束接口文件组织方式
- 说明一个接口文件应该如何命名和编写

### `api/services/templateApi.ts`

职责：

- 提供新增业务接口的模板

模板内容包含：

- 入参类型
- 出参类型
- 接口函数
- 说明注释

## 3. 聊天持久化层 `src/features/chatPersistence`

### `types.ts`

职责：

- 定义聊天首页、消息、快照、状态等类型

关键类型：

- `ChatHomeItem`
- `ChatHomePage`
- `ChatHomeSnapshot`
- `ChatMessageItem`
- `ChatMessageRole`
- `ChatMessageStatus`
- `PendingOutboxMessage`

### `schema.ts`

职责：

- 定义 Drizzle 的 SQLite 表结构

当前表：

- `conversations`
- `messages`
- `outbox_messages`

### `database.ts`

职责：

- 打开 SQLite 数据库
- 初始化 Drizzle 实例
- 执行数据库建表和索引创建

实现特点：

- 使用 `openDatabaseSync`
- 启用 `enableChangeListener`
- 启用 WAL

### `homeSnapshot.ts`

职责：

- 读写首页启动快照

特点：

- 基于 `MMKV`
- 只存第一页会话摘要
- 带 `version` 字段，便于后续升级

### `chatRepository.ts`

职责：

- 聊天本地数据的统一读写入口

主要能力：

- 初始化 demo 数据
- 读取首页分页数据
- 读取会话消息列表
- 创建本地待发送消息
- 消费 ack，更新发送状态
- 标记发送失败
- 写入收到的新消息
- 读取待补发 outbox
- 刷新首页快照

设计原则：

- SQLite 是唯一真源
- conversations 摘要由 messages 推导并回写
- MMKV 快照由 repository 统一刷新

### `ChatHomeStorageDemo.tsx`

职责：

- 演示当前聊天数据链路是如何工作的

当前页面包含：

- 首页会话列表
- 启动来源标识：`MMKV snapshot` / `SQLite source of truth`
- Socket 状态展示
- 待发送 outbox 数量
- 最近一次同步原因
- 发送 demo 消息按钮
- SQLite 驱动的线程预览

页面行为：

- 首先读取 MMKV 快照
- 然后读取 SQLite
- 订阅 `chatSyncService`
- 收到同步事件后重新拉取当前可见数据

## 4. 聊天实时层 `src/features/chatRealtime`

### `types.ts`

职责：

- 定义 WebSocket 状态、入站事件、出站消息、同步原因等类型

关键类型：

- `ChatSocketStatus`
- `OutgoingChatSocketMessage`
- `ChatSocketEvent`
- `ChatSyncDataReason`
- `ChatSyncEvent`

### `wsManager.ts`

职责：

- 管理唯一的 WebSocket 连接实例

核心能力：

- 解析并生成 WS URL
- 建立连接
- 订阅连接状态
- 订阅实时事件
- 自动重连
- mock 模式回退

边界：

- 不读写 SQLite
- 不读写 MMKV
- 不直接更新页面

### `chatSyncService.ts`

职责：

- 连接实时层和本地持久化层

核心能力：

- 启动实时同步
- 发送消息
- 首连和重连时 flush outbox
- 处理 ack
- 处理收到的新消息
- 向页面派发同步事件

它是当前聊天实时数据流里的业务协调层。

## 5. 通用 UI 层 `src/shared`

### `visual/foundation.ts`

职责：

- 提供当前移动端主题的唯一视觉 token 入口
- 管理背景、表面、文本、分隔线、圆角、阴影、头像色板和状态语义
- 作为后续 UI 改造的默认主题来源

设计主题：

- 白底 + 平面列表
- 蓝色主强调 + 灰色辅助信息
- 扁平、简约、对话优先

### `visual/AppLineIcon.tsx`

职责：

- 提供统一的线性风格图标组件
- 保持 Tab、Header、抽屉和辅助操作区的图标风格一致

适用场景：

- 底部 Tab
- 顶部 Header 操作
- 轻量浮层与抽屉

### `components/PaginatedCardList.tsx`

职责：

- 提供通用的高性能分页列表容器

当前能力：

- 基于 `FlashList`
- 固定项高度参数
- 下拉刷新
- 自动触底加载更多
- 顶部 loading
- 底部 loading
- 滚动超过一屏后显示返回顶部按钮

视觉约束：

- 长列表默认平面化，不给每一行叠阴影
- 页面底部避让跟随真实 tab bar / safe area，不在页面里手算列表留白

适用场景：

- 会话列表
- 文件列表
- 终端会话列表

### `components/ConversationContentRenderer.tsx`

职责：

- 提供纯共享的对话内容渲染组件入口
- 通过 `src/shared/markdown` 完成 Markdown AST 解析、流式 frozen/tail 分块和资源分类

当前能力：

- Markdown AST 块级渲染和缓存
- 标题、段落、列表、引用
- 任务列表、GFM 表格、行内代码与代码块
- 链接、附件、图片渲染
- `mermaid` / `echarts` / `html` / `viewport` 等 custom fence 的 registry 分发
- 流式消息只重算 tail block，已冻结块保持稳定
- 通过回调和 resolver 承接业务侧跳转或资源解析

适用场景：

- Chat 详情正文
- AI 回复气泡
- 需要富文本消息渲染但不能引入业务依赖的共享区域

## 6. 当前模块关系

```text
ChatHomeStorageDemo
  -> chatSyncService
  -> chatRepository
  -> homeSnapshot
  -> PaginatedCardList

ChatDetailScreen
  -> chatSyncService
  -> chatRepository
  -> ConversationContentRenderer

chatSyncService
  -> chatWsManager
  -> chatRepository

chatRepository
  -> chatDb
  -> schema
  -> homeSnapshot

api service files
  -> apiClient
  -> runtimeEnv
```

## 7. 后续新增代码建议

- 新业务请求：放到 `src/core/api/services/`
- 新聊天本地读写：优先加到 `chatRepository.ts`
- 新实时协议处理：优先加到 `chatSyncService.ts`
- 新通用列表页面：优先复用 `PaginatedCardList.tsx`
- 新对话正文展示：优先复用 `ConversationContentRenderer.tsx`
- 新页面入口：优先从 `TabScreens.tsx` 或后续 stack navigator 接入
