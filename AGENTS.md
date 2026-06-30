# AGENTS.md

修改代码前必须阅读此文件。

## 行为准则

1. **先索引，再下钻** — 先运行 `xgraph context "<task>" --budget small`，再按返回的 `.doc` 路径读取；CLI 不可用时从 `.doc/index.json` 和 `.doc/catalog/tasks.json` 下钻。
2. **简单优先** — 不加需求外能力，不提前抽象，不顺手重构无关模块。
3. **外科手术式修改** — 只动当前任务要求的文件和链路，每处改动都要能追溯到需求。
4. **先看影响面** — 改动前先确认相关 module card、flow card、rules，避免头痛医头脚痛医脚。
5. **禁止绕过边界** — 页面不直接操作 SQLite / MMKV / WebSocket；实时写入继续走 `chatSyncService` / `chatRepository`。
6. **上下文同步更新** — 只要改了模块职责、公共入口、运行链路、任务入口或规则，同一任务里同步更新 `.doc/curated`，并运行 `xgraph index` / `xgraph status`。

## 常用命令

```bash
pnpm start            # Expo 开发服务器
pnpm web              # Web 预览
pnpm android          # Android 运行
pnpm android:device   # Android 真机选择
pnpm ios              # iOS 运行
pnpm typecheck        # TypeScript 检查
pnpm lint             # ESLint
pnpm test             # node:test 脚本
pnpm build            # Expo 导出构建
pnpm build:android    # EAS Android preview 构建
xgraph context "<task>" --budget small  # 获取任务上下文
xgraph index                         # 重建 .doc 派生索引
xgraph status                        # 检查上下文状态
```

## 项目概要

Expo SDK 56 + React Native 0.85 + TypeScript 6。当前仓库是迁移后的 `zenmind-react-app`，主结构为 `app / core / features / shared`。

| 区域 | 当前入口 | 路径 |
| ---- | -------- | ---- |
| app | `AppRoot` / `RootNavigator` / `AppLaunchSkeleton` | `App.tsx`, `src/app/` |
| core | `apiRequest` / `authenticatedApiRequest` / `appAuth` | `src/core/api`, `src/core/auth`, `src/core/config` |
| chat persistence | `ChatHomeScreen` / `ChatDetailScreen` / `chatRepository` | `src/features/chatPersistence/` |
| chat realtime | `chatSyncService` / `chatWsTransport` / `WsClient` | `src/features/chatRealtime/` |
| chat timeline | `ChatTimelineState` reducer / persistence | `src/features/chatTimeline/` |
| notifications | `notificationService` | `src/features/notifications/` |
| shared ui | `ScreenHeader` / `PaginatedCardList` / `ConversationMarkdownRenderer` / `AppIcon` | `src/shared/` |

当前底部 Tab：

| Tab | 标签 | 实际入口 |
| --- | --- | -------- |
| Chat | 对话 | `src/features/chatPersistence/ChatHomeScreen.tsx` |
| Terminal | 任务 | `src/features/agentTaskBoard/AgentTaskBoardScreen.tsx` |
| Me | 用户 | `src/app/screens/TabScreens.tsx` 用户与会话信息页 |

待后期实现：

| 模块 | 状态 | 预留入口 |
| ---- | ---- | -------- |
| Drive / 网盘 | 当前不挂底部 Tab，待后期接入真实同步、上传和引用链路 | `src/app/screens/DriveScreen.tsx` |

`ChatDetail` 由 root stack 承载，入口是 `src/features/chatPersistence/ChatDetailScreen.tsx`。

XGraph 上下文主入口：`.doc/index.json`

## 边界与约束

直接修改通常安全：

- 单个 screen / component
- `chatRepository`、`chatSyncService` 这类局部 service / repository
- `src/shared/components`、`src/shared/icons`、`src/shared/visual` 内的通用 UI
- `.doc/curated/*`、`.doc/reference/*` 和 XGraph 索引文件
- 同模块类型定义、文档、校验脚本

跨模块入口，触碰前必须先看对应 flow / task card 并说明影响面：

- `App.tsx`
- `src/app/AppRoot.tsx`
- `src/app/navigation/RootNavigator.tsx`
- `src/features/chatPersistence/database.ts`
- `src/features/chatPersistence/schema.ts`
- `src/features/chatRealtime/chatWsTransport.ts`
- `src/features/chatRealtime/wsClient.ts`
- `app.config.js`
- `brands/`
- `metro.config.js`
- `tsconfig.json`
- `android/`

当前硬约束：

- 页面不直接 import `database.ts`、`schema.ts`、`chatWsTransport.ts`、`wsClient.ts`
- SQLite 是聊天目录、会话摘要、消息、outbox、read state 和 rich timeline snapshot 的本地真源
- MMKV 只保存首页冷启动目录快照
- `chatWsTransport` / `WsClient` 只负责 transport，不直接写 UI 或 SQLite
- 实时业务写入必须继续走 `chatSyncService` / `chatRepository`
- 影响首页目录的持久化改动必须继续刷新 MMKV 目录快照

## 包依赖变更边界

涉及 npm / pnpm / yarn / bun 依赖新增、升级、降级、移除或版本声明调整时：

- AI 只能修改 `package.json`
- 禁止修改 `pnpm-lock.yaml`、`package-lock.json`、`yarn.lock`、`bun.lockb` 等 lock 文件
- 禁止运行 `pnpm install`、`npm install`、`yarn install`、`bun install` 或其他会写入 lock / `node_modules` 的安装命令
- 如需刷新 lock 文件或实际安装依赖，必须停止并提示用户手动执行

## 依赖规则

当前推荐依赖方向：

```text
App Shell / Screen
  -> Feature Screen
     -> Service / Repository
        -> SQLite / MMKV / WebSocket / API

Core
  -> 提供认证、环境变量和统一 API 能力

Shared
  -> 只放可复用 UI、图标、Markdown 和视觉 token
```

禁止：

- `screen` 直接操作 SQLite、MMKV 或 WebSocket
- `shared` 组件依赖聊天持久化或实时模块
- `chatWsTransport` / `WsClient` 直接处理 UI 状态
- 用 MMKV 替代 SQLite 作为排序、状态、消息或 timeline 真源

## UI 主题约定

- 新 UI 或视觉改造默认继承 `.doc/reference/ui-visual-theme.md` 与 `src/shared/visual/foundation.ts`，不要为单个页面另起一套主题。
- 一级页面继续使用白底、平面列表、蓝色主强调、弱灰辅助信息、固定 Header 和贴底式底部导航。
- 优先复用 `ScreenHeader`、`AppScreenFrame`、`PaginatedCardList`、`AppIcon`、`AppIconButton`，避免重复造视觉壳层。
- 长列表项默认保持平面，不为每一行叠阴影；阴影只在确实需要抬升的浮层里少量使用。
- 底部 Tab 避让必须基于真实 `safe area` / `tab bar height`，禁止在页面内硬编码 `paddingBottom` 猜底栏高度。

## 命名约定

| 类型 | 规范 | 示例 |
| ---- | ---- | ---- |
| Component / Screen | PascalCase | `AppRoot`, `ChatDetailScreen` |
| Service / Manager 单例 | camelCase | `chatSyncService`, `notificationService` |
| Repository / API 函数 | camelCase 动词 | `createOutgoingMessage`, `authenticatedApiRequest` |
| 类型 | PascalCase | `ChatHomeItem`, `ChatTimelineState` |
| 常量 | UPPER_SNAKE_CASE | `CHAT_PAGE_SIZE` |
| 知识库卡片 id | kebab-case | `feature-chat-persistence` |
| 测试 | `__tests__/原文件名.test.ts(x)` 或脚本测试 | `ScreenHeader.test.tsx`, `scripts/tests/*.test.mts` |

## 按需深度上下文

日常任务不要先通读整个仓库，按知识库入口逐层下钻。

| 关键词 | 触发动作 | 说明 |
| ------ | -------- | ---- |
| `#知识库` | 运行 `xgraph context "<task>" --budget small`，必要时读取 `.doc/index.json` + `.doc/catalog/tasks.json` | 任务入口和阅读路径 |
| `#模块` | 读取 `.doc/modules/*.json` + `.doc/reference/module-reference.md` | 模块职责、入口、影响清单 |
| `#链路` | 读取 `.doc/flows/*.json` + `.doc/reference/project-architecture.md` | 冷启动、发送、接收等运行链路 |
| `#规则` | 读取 `.doc/rules.json` | 当前机器可读边界约束 |
| `#索引更新` | 运行 `xgraph index`、`xgraph status`，必要时检查 `.doc/curated` | 知识库构建、校验、过期检查 |

未触发时不要先读取全部 `.doc/modules/*` 和 `.doc/flows/*`，先走 `xgraph context -> task -> module/flow -> code`。

<!-- xgraph:start -->
## Project Context

Before work, run `xgraph context "<task>" --budget small` when the CLI is available, then read only the returned paths.

If the task is already tied to files, use `xgraph context --file <path>` or `xgraph affected --file <path>` before broad searching.

Fallback: read `.doc/index.json` and follow its `readOrder` progressively. Start from `.doc/catalog.json` or the catalog paths declared by the index, then inspect related module cards only as needed.

Keep this entry file short; use `.doc/rules/agent.md` for detailed behavior.

Before finishing, run `xgraph status`; when an agent lifecycle hook is installed, let it run `xgraph finish`, otherwise run `xgraph sync`.

<!-- xgraph:end -->
