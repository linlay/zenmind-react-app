# ZenMind React App Docs

本目录描述 `zenmind-react-app` 当前代码结构、模块职责、主要运行链路和视觉约束。仓库主体已从原移动端骨架迁移到此目录，文档应以这里的实际源码为准。

## 文档索引

- [模型知识库入口](./kb/root.json)
- [项目架构总览](./project-architecture.md)
- [模块说明清单](./module-reference.md)
- [移动端视觉主题](./ui-visual-theme.md)

## 知识库维护

`doc/kb/root.json` 是模型读取项目知识的主入口。它由 `doc/kb/curated` 和源码静态事实生成，不能只手改生成目录。

常用命令：

```bash
pnpm kb:build
pnpm kb:validate
pnpm kb:check-stale
```

## 当前项目定位

当前项目是 Expo 56 / React Native 0.85 的跨平台移动应用，主结构为 `app / core / features / shared`：

- `app`：启动遮罩、认证门卫、React Navigation root stack / bottom tabs、开发态 Debug 面板。
- `core`：API client、认证会话与设备 profile、运行时配置、HTTP/WS debug logging、共享 WebSocket transport。
- `features`：Chat 首页与详情页、聊天持久化、通过 core WS transport 的实时同步、rich timeline、通知、AI 任务看板、登录页。
- `shared`：共享 Header、分页列表、图标、Markdown 渲染和视觉 token。

当前底部 Tab：

| Tab | 标签 | 实际入口 |
| --- | --- | -------- |
| `Chat` | 对话 | `src/features/chatPersistence/ChatHomeScreen.tsx` |
| `Terminal` | 任务 | `src/features/agentTaskBoard/AgentTaskBoardScreen.tsx` |
| `Drive` | 网盘 | `src/app/screens/TabScreens.tsx` 占位页 |
| `Me` | 用户 | `src/app/screens/TabScreens.tsx` 用户与会话信息页 |

`ChatDetail` 是 root stack 上层 route，由 `src/features/chatPersistence/ChatDetailScreen.tsx` 承载。

## 维护原则

- 页面不直接读写 SQLite、MMKV 或底层 WebSocket transport。
- SQLite 是聊天目录、会话摘要、消息、outbox、read state 和 rich timeline snapshot 的本地真源。
- MMKV 只保存首页首屏目录冷启动快照。
- 实时业务写入继续走 `chatSyncService` / `chatRepository`。
- HTTP 认证 profile 继续走 `deviceToken` + `/api/auth/refresh`；Desktop WS profile 只保存 Desktop WS token、`wsUrl` 和 token mode，不写入旧 device token key。
- `src/core/ws` 只负责 AP `/ap/ws` 与 Desktop `/ws` 的底层 WebSocket transport、namespace、重连、pending request / stream 和 push/status 订阅。
- `chatWsTransport` 只做聊天协议 adapter，业务写入继续走 `chatSyncService` / `chatRepository`。
- 新 UI 默认继承 `doc/ui-visual-theme.md` 与 `src/shared/visual/foundation.ts`。
