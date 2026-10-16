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

## 真机 development 调试

开发与生产都启用 Worklets Bundle Mode，`start` / `android` / `android:device` / `ios` / `web` 启动前会执行 `prepare:bundle`，生成流式 Markdown 所需的 Worklet 文件。首次应用配置修复时停止旧 Metro，使用原有环境产物启动入口并传入 `--clear`，然后在真机完整重载。

当前未安装 Worklets 的 Metro 热更新补丁。修改 Worklet 或动画回调后，需停止 Metro、重新运行上述启动入口完成预生成，再完整重载应用；只做 Fast Refresh 可能出现 SHA-1 或 Worklet hash 错误。

真实默认源需要使用私有环境产物启动 Metro。先停止旧 Metro，在 `react-app-env/env.development` 中保留已有 ZenMind 客户端凭据，再执行：

```bash
cd ../react-app-env
bash examples/build-react-app.sh development ../zenmind-react-app start
```

该入口依次构建 development 产物、校验 manifest 与 consumer，并让 `REACT_APP_ENV_ARTIFACT` 覆盖整个 Metro 生命周期；退出时恢复原生成文件。已安装调试客户端的真机连接这个 Metro 并重新加载 bundle。首次安装可将末尾 `start` 换为 `android:device`，同样使用环境产物。不要在旁边另开不带环境产物的 Metro。

验收需从真机实际加载的 bundle 核对 `REACT_APP_ENV_ARTIFACT_VERSION` 为 development 版本、ZenMind 默认源地址为 `https://app.zenmind.cc`、WS 路径为 `/ap/ws`，并完成目录加载与一轮对话；仅检查源码不算通过。示例配置继续用于契约测试，不覆盖私有真实配置，不手改生成文件或提交客户端凭据。

Desktop 修复重启后，使用它当前生成的二维码重新扫码；旧地址不会自动改写，旧聊天历史继续保留。“配对信息已保存”仅表示绑定存在，默认源与 Desktop 的在线状态分别显示。下拉刷新等待两个来源各自结束，成功来源写入本地目录，失败提示标明来源。

## 知识库

模型优先上下文入口：

```bash
xgraph context "<task>" --budget small
```

长期上下文由 `.doc/curated`、`.doc/reference` 和源码静态事实生成。修改模块职责、公共入口、运行链路、任务入口或规则时，先改 curated/reference 文件，再重建并检查：

```bash
xgraph index
xgraph status
```

## 技术栈

| 类别     | 技术                                  | 当前版本        |
| -------- | ------------------------------------- | --------------- |
| 框架     | Expo / React Native                   | 56 / 0.85       |
| React    | React / React DOM                     | 19.2            |
| 语言     | TypeScript                            | 6.0             |
| 导航     | React Navigation bottom tabs + stack  | 7.x             |
| 列表     | @shopify/flash-list                   | 2.0             |
| 持久化   | expo-sqlite + drizzle-orm + MMKV      | 56 / 0.44 / 3.3 |
| 实时通信 | WebSocket                             | `/ap/ws`        |
| 通知     | expo-notifications                    | 56              |
| Markdown | react-native-streamdown / enriched md | 0.2 / 0.6       |
| WebView  | react-native-webview                  | 13.16           |
| 动画     | react-native-reanimated + worklets    | 4.3 / 0.8       |

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
│   ├── lib/brand-config.js         # 品牌配置校验与 generated 产物同步
│   ├── tests/                      # node:test 脚本
│   └── worklets/                   # Metro 启动前预生成 worklets bundle
├── .doc/                           # XGraph 项目上下文、知识卡片和参考文档
│   ├── index.json
│   ├── curated/
│   ├── modules/
│   ├── flows/
│   ├── tasks/
│   └── reference/
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

| Route / Tab       | 实际入口                                               | 说明                  |
| ----------------- | ------------------------------------------------------ | --------------------- |
| `Login`           | `src/features/auth/LoginScreen.tsx`                    | 认证冷启动和登录页    |
| `Tabs > Chat`     | `src/features/chatPersistence/ChatHomeScreen.tsx`      | Chat 首页目录         |
| `Tabs > Terminal` | `src/features/agentTaskBoard/AgentTaskBoardScreen.tsx` | 移动端 AI 任务看板    |
| `Tabs > Drive`    | `src/app/screens/TabScreens.tsx`                       | 网盘占位页            |
| `Tabs > Me`       | `src/app/screens/TabScreens.tsx`                       | 用户与会话信息页      |
| `ChatDetail`      | `src/features/chatPersistence/ChatDetailScreen.tsx`    | Tabs 之上的聊天详情页 |

`AppRoot` 还负责认证 bootstrap、前台 access token 预刷新、系统通知点击路由、`chatSyncService` 启停，以及开发态 Debug 面板宿主。

## 数据与实时同步

Chat 数据真源：

- SQLite：目录项、会话摘要、消息、read state、conversation sync state、rich timeline snapshot。
- MMKV：只保存 Chat 首页首屏目录冷启动快照，不承担排序、查询或完整消息历史职责。
- `chatRepository`：本地读写唯一入口，统一刷新 SQLite 与目录快照。
- `chatSyncService`：实时同步业务协调层，负责 发送、ack、push、stream、awaiting submit、stop/resume 和 scoped UI event。
- `chatWsTransport` / `WsClient`：只处理 `/ap/ws` transport、request、stream、push、重连和调试 frame 记录。

发送链路：

```text
ChatDetail / Chat 首页
  -> chatSyncService.sendMessage()
  -> chatRepository.createOutgoingMessage()
  -> SQLite messages + conversation summary
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

- 首次启动进入对话 Tab，账号恢复后未登录显示登录空态；手机账号负责有效设备、电脑授权、来源选择及本地缓存边界。
- `accountAuth` 处理 Identity 登录、挑战、恢复、单飞刷新和退出；手机 Identity JWT 仅发送给配置的 Identity/Hub origin。
- `activeDesktop` 按账号保存唯一来源，首次默认云端；Desktop 连接通过 Hub 获取绑定账号、手机与目标电脑的短期路由凭证。
- 云端沿用既有配置产物的 `authMode/accessToken`，HTTP、WS 和同源资源使用同一凭证；`none` 不附带 token，云端 401 不触发 Identity 刷新重试。
- 手机退出隐藏账号内容并释放手机连接，不退出电脑、不取消已提交的远端任务；旧电脑配对凭证不作回退。
- 开发态 `EXPO_PUBLIC_API_BASE_URL` 与 `EXPO_PUBLIC_CHAT_WS_URL` 只覆盖云端连接，不覆盖 Desktop 路由 endpoint。

## 后端接口概览

云端 HTTP REST 通过 `authenticatedApiRequest()` 按既有 authMode 附加配置凭证；WS request / stream 走 `/ap/ws`。Desktop 请求走当前账号路由的 `/ws`，手机 JWT 不作为云端凭证。

| 能力                     | 端点                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| 手机登录 / 刷新 / 登出   | Identity 账号接口，由 `accountAuth` 调用                                                            |
| agents / teams / chats   | `/api/agents`、`/api/teams`、`/api/chats` via `/ap/ws` request                                      |
| 单会话详情               | `/ap/api/chat`                                                                                      |
| 标记已读                 | `/ap/api/read`                                                                                      |
| 附件上传                 | 云端 `/api/upload`；Desktop 当前路由同 Host HTTPS `/api/upload`                                     |
| 通知 token 注册          | `POST /api/notifications/device-tokens`、`DELETE /api/notifications/device-tokens/:nativePushToken` |
| WebSocket transport      | `ws(s)://<host>/ap/ws?token=<accessToken>`                                                          |
| WebSocket query / attach | `/api/query`、`/api/attach` via `/ap/ws` stream                                                     |
| Awaiting submit          | `/ap/api/submit`                                                                                    |

## 构建与发布

```bash
pnpm build
pnpm build:android
pnpm build:android:zenmind
pnpm build:android:cutej
pnpm build:ios
pnpm build:ios:zenmind
pnpm build:ios:cutej
pnpm submit:ios
pnpm submit:ios:zenmind
pnpm submit:ios:cutej
pnpm release:ios
pnpm release:ios:zenmind
pnpm release:ios:cutej
```

默认品牌为 ZenMind；当前多品牌共享 native identity，Android package 为 `com.zqfrank.agentterminalapp`，iOS bundle id 为 `cc.zenmind.ios`。CuteJ 通过 `BRAND=cutej` 切换展示名称、图标、启动图和通知色。`BRAND=<id> pnpm brand:sync` 会校验 `brands/<id>/brand.json`，生成运行时品牌常量，并把 PNG 缓存在 `assets/generated/brand/<id>/` 下。

### iOS 发布到 TestFlight

ZenMind / CuteJ 当前共享 iOS bundle id 和同一个 App Store Connect app。两者都提交到同一个 TestFlight 应用，只是构建包内展示名称、图标、启动图和运行时品牌不同。

已有远端 EAS iOS 构建时，提交最新构建：

```bash
pnpm submit:ios:zenmind
pnpm submit:ios:cutej
```

`submit:ios:*` 适合刚完成对应品牌 EAS build、确认它就是最新 iOS 构建的场景；如果不确定最新远端构建属于哪个品牌，优先使用本地 `.ipa` 路径提交。

如果手上是已下载的本地 `.ipa` 文件，提交指定文件：

```bash
pnpm submit:ios:zenmind:ipa -- /Users/ther/project/git/zenmind/app.ipa
pnpm submit:ios:cutej:ipa -- /Users/ther/project/git/zenmind/app.ipa
```

如果使用 `~`，不要再额外写用户名；`~/project/...` 会展开到 `/Users/ther/project/...`，`~/ther/project/...` 会变成 `/Users/ther/ther/project/...`。

需要一键构建并提交到 App Store Connect 时：

```bash
pnpm release:ios:zenmind
pnpm release:ios:cutej
```

提交完成后，在 App Store Connect 的 ZenMind 应用里进入 TestFlight，等待构建处理完成，再添加内部测试员、外部测试组或分享测试邀请。当前模式下不要期待 ZenMind 和 CuteJ 在 TestFlight 中作为两个独立应用并存；需要独立应用时再拆独立 bundle id、App Store Connect app 和发布 profile。

如果安装新 ZenMind APK 时遇到覆盖问题，可先卸载旧包：

```bash
adb uninstall com.zqfrank.agentterminalapp
```

## 文档

- [XGraph 上下文入口](./.doc/index.json)
- [参考文档入口](./.doc/reference/README.md)
- [项目架构总览](./.doc/reference/project-architecture.md)
- [模块说明清单](./.doc/reference/module-reference.md)
- [移动端视觉主题](./.doc/reference/ui-visual-theme.md)

## License

Private
