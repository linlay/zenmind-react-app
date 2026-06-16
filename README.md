# ZenMind React App

Expo + React Native + TypeScript 移动端应用。当前仓库承接原 `zenmind-mobile`
项目主体，主结构为 `app / core / features / shared`，重点覆盖认证门卫、Chat 首页与详情页、SQLite 本地真源、MMKV 冷启动快照、`/ap/ws` 实时同步、系统通知和开发态调试面板。

## 启动

```bash
pnpm install
pnpm start
```

常用命令：

```bash
pnpm web
pnpm android
pnpm android:device
pnpm ios
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## 知识库

模型优先知识库入口：[`doc/kb/root.json`](./doc/kb/root.json)

知识库由 `doc/kb/curated` 和源码静态事实生成，修改模块职责、公共入口、运行链路、任务入口或规则时，先改 curated 文件再重建：

```bash
pnpm kb:build
pnpm kb:validate
pnpm kb:check-stale
```

## 技术栈

| 类别     | 技术                                   | 当前版本 |
| -------- | -------------------------------------- | -------- |
| 框架     | Expo / React Native                    | 56 / 0.85 |
| React    | React / React DOM                      | 19.2     |
| 语言     | TypeScript                             | 6.0      |
| 导航     | React Navigation bottom tabs + stack   | 7.x      |
| 列表     | @shopify/flash-list                    | 2.0      |
| 持久化   | expo-sqlite + drizzle-orm + MMKV       | 56 / 0.44 / 3.3 |
| 实时通信 | WebSocket                              | `/ap/ws` |
| 通知     | expo-notifications                     | 56       |
| Markdown | react-native-streamdown / enriched md  | 0.2 / 0.6 |
| WebView  | react-native-webview                   | 13.16    |
| 动画     | react-native-reanimated + worklets     | 4.3 / 0.8 |

## 环境要求

- Node.js >= 22（`pnpm test` 使用 Node TypeScript transform 参数）
- pnpm 7.x（仓库声明 `pnpm@7.33.7`）
- Expo CLI（通过 `pnpm start` 或 `npx expo` 使用）
- iOS 开发：Xcode + iOS Simulator 或真机
- Android 开发：Android Studio + Emulator 或物理设备

## 项目结构

```text
zenmind-react-app/
├── App.tsx                         # SafeAreaProvider + native splash handoff + React 启动遮罩
├── app.config.js                   # Expo 动态配置，按 BRAND 输出品牌包
├── brands/                         # 多品牌 manifest、i18n 和构建期视觉参数
├── index.js                        # Expo registerRootComponent
├── package.json
├── scripts/
│   ├── kb/                         # 知识库 build / validate / stale check
│   ├── lib/brand-config.js         # 品牌配置校验与 generated 产物同步
│   ├── tests/                      # node:test 脚本
│   └── worklets/                   # Metro 启动前预生成 worklets bundle
├── doc/
│   ├── kb/                         # 生成后的模型知识库
│   ├── project-architecture.md
│   ├── module-reference.md
│   └── ui-visual-theme.md
└── src/
    ├── app/                        # 应用壳层、导航、启动遮罩、开发态 Debug 面板
    ├── core/                       # API、认证、运行时配置、HTTP debug logging
    ├── features/                   # auth、chatPersistence、chatRealtime、chatTimeline、notifications、agentTaskBoard
    ├── shared/                     # 共享 UI、图标、Markdown、视觉 token
    └── types/
```

## 运行架构

应用入口链路：

```text
index.js
  -> App.tsx
  -> SafeAreaProvider
  -> AppRoot
  -> NavigationContainer
  -> RootNavigator
```

`RootNavigator` 使用 root stack 承载登录门卫、底部 Tab 和 Chat 详情页：

| Route / Tab | 实际入口 | 说明 |
| ----------- | -------- | ---- |
| `Login` | `src/features/auth/LoginScreen.tsx` | 认证冷启动和登录页 |
| `Tabs > Chat` | `src/features/chatPersistence/ChatHomeScreen.tsx` | Chat 首页目录 |
| `Tabs > Terminal` | `src/features/agentTaskBoard/AgentTaskBoardScreen.tsx` | 移动端 AI 任务看板 |
| `Tabs > Drive` | `src/app/screens/TabScreens.tsx` | 网盘占位页 |
| `Tabs > Me` | `src/app/screens/TabScreens.tsx` | 用户与会话信息页 |
| `ChatDetail` | `src/features/chatPersistence/ChatDetailScreen.tsx` | Tabs 之上的聊天详情页 |

`AppRoot` 还负责认证 bootstrap、前台 access token 预刷新、系统通知点击路由、`chatSyncService` 启停，以及开发态 Debug 面板宿主。

## 数据与实时同步

Chat 数据真源：

- SQLite：目录项、会话摘要、消息、outbox、read state、conversation sync state、rich timeline snapshot。
- MMKV：只保存 Chat 首页首屏目录冷启动快照，不承担排序、查询或完整消息历史职责。
- `chatRepository`：本地读写唯一入口，统一刷新 SQLite 与目录快照。
- `chatSyncService`：实时同步业务协调层，负责 outbox replay、发送、ack、push、stream、awaiting submit、stop/resume 和 scoped UI event。
- `chatWsTransport` / `WsClient`：只处理 `/ap/ws` transport、request、stream、push、重连和调试 frame 记录。

发送链路：

```text
ChatDetail / Chat 首页
  -> chatSyncService.sendMessage()
  -> chatRepository.createOutgoingMessage()
  -> SQLite messages + outbox + conversation summary
  -> chatWsTransport.streamChatQuery(/api/query over /ap/ws)
  -> ack / stream event
  -> repository patch + timeline replace
```

首页冷启动链路：

```text
ChatHomeScreen mount
  -> readChatDirectorySnapshot()
  -> prewarmChatHomeDirectory()
  -> SQLite directory slice
  -> chatSyncService.start()
  -> home.directory.replace / home.item.patch scoped events
```

## 认证与配置

- 首次进入登录页填写后端域名或 IP。
- `normalizeApiBaseUrl()` 会为内网 / localhost 自动使用 `http://`，公网域名默认使用 `https://`。
- `deviceToken` 和 API base URL 分别写入 MMKV，用于会话恢复和后续请求。
- `accessToken` 短期有效，`AppRoot` 在前台恢复和定时器中通过 `ensureFreshAccessToken()` 预刷新。
- 开发态可用 `EXPO_PUBLIC_API_BASE_URL` 提供默认后端地址。
- 开发态可用 `EXPO_PUBLIC_CHAT_WS_URL` 覆盖 WebSocket 地址；正式路径默认从 API base URL 推导到 `/ap/ws`。

## 后端接口概览

HTTP REST 请求通过 `authenticatedApiRequest()` 自动附加 `Authorization: Bearer <accessToken>`；WS request / stream 走同一条 `/ap/ws` 连接。

| 能力 | 端点 |
| ---- | ---- |
| 登录 / 刷新 / 登出 | `/api/auth/login`、`/api/auth/refresh`、`/api/auth/logout` |
| agents / teams / chats | `/api/agents`、`/api/teams`、`/api/chats` via `/ap/ws` request |
| 单会话详情 | `/ap/api/chat` |
| 标记已读 | `/ap/api/read` |
| 附件上传 | `/ap/api/upload` |
| 通知 token 注册 | `POST /api/notifications/device-tokens`、`DELETE /api/notifications/device-tokens/:nativePushToken` |
| WebSocket transport | `ws(s)://<host>/ap/ws?token=<accessToken>` |
| WebSocket query / attach | `/api/query`、`/api/attach` via `/ap/ws` stream |
| Awaiting submit | `/ap/api/submit` |

## 构建与发布

```bash
pnpm build
pnpm build:android
pnpm build:android:zenmind
pnpm build:android:cutej
```

默认 Android/iOS 品牌为 ZenMind，包名和 bundle id 为 `com.zqfrank.agentterminalapp`；CuteJ 使用 `cc.cutej.app`，可与默认包并排安装。`BRAND=<id> pnpm brand:sync` 会校验 `brands/<id>/brand.json`，生成运行时品牌常量，并把 PNG 缓存在 `assets/generated/brand/<id>/` 下。

如果安装新 ZenMind APK 时遇到覆盖问题，可先卸载旧包：

```bash
adb uninstall com.zqfrank.agentterminalapp
```

## 文档

- [文档入口](./doc/README.md)
- [项目架构总览](./doc/project-architecture.md)
- [模块说明清单](./doc/module-reference.md)
- [移动端视觉主题](./doc/ui-visual-theme.md)

## License

Private
