# ZenMind React App

React Native (Expo) + TypeScript 跨平台移动应用，提供 AI 聊天助理、PTY 终端、智能体管理等功能。采用四业务域单壳架构。

## 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| 框架 | React Native (Expo) | RN 0.81 / Expo SDK 54 |
| 语言 | TypeScript | 5.9 |
| 状态管理 | Redux Toolkit + RTK Query | 2.5 |
| UI | React Native StyleSheet (无 CSS-in-JS) | — |
| 持久化 | @react-native-async-storage/async-storage | 2.2 |
| WebView | react-native-webview | 13.15 |
| Markdown 渲染 | react-native-markdown-display | 7.0 |
| HTML 渲染 | react-native-render-html | 6.3 |
| SVG | react-native-svg | 15.15 |
| 渐变 | expo-linear-gradient | 15.0 |
| 剪贴板 | expo-clipboard | 8.0 |
| 测试 | Jest + jest-expo | 29.7 |

## 环境要求

- Node.js >= 18
- npm >= 9
- Expo CLI (`npx expo`)
- iOS 开发: Xcode + iOS Simulator (macOS)
- Android 开发: Android Studio + Emulator 或物理设备

## 安装与运行

```bash
# 克隆仓库
git clone <repo-url>
cd zenmind-react-app

# 安装依赖
npm install

# 启动开发服务器
npm run start        # 交互式选择平台
npm run ios          # iOS 模拟器
npm run android      # Android 模拟器/设备
npm run web          # 浏览器
```

## 测试与检查

```bash
npm run test         # Jest 单元测试
npm run typecheck    # TypeScript 类型检查 (tsc --noEmit)
```

项目未配置 ESLint，无独立 lint 命令。

## 构建与发布

```bash
npm run build        # Expo 导出构建
```

### 安卓内部分发（APK）

```bash
npx eas login
npx eas build -p android --profile preview
```

- `preview` 配置: `distribution: internal`, `android.buildType: apk`
- 构建完成后 EAS 提供下载链接和二维码，手机扫码即可安装

### 正式发布（Google Play）

```bash
npx eas build -p android --profile production
npx eas submit -p android --profile production
```

## 首次启动配置

- 应用首次启动会在登录页要求填写后端域名/IP（例如 `api.example.com` 或 `192.168.1.8:8080`）
- 内网 IP / localhost 自动使用 `http://`，公网域名自动使用 `https://`
- PTY WebView 默认地址: `https://{host}/appterm`（本地调试: `http://localhost:11931/appterm`）

## 项目结构

```
zenmind-react-app/
├── App.tsx                          # 应用入口 (SafeAreaProvider > AppProviders > AppRoot)
├── index.js                         # Expo registerRootComponent
├── app.json                         # Expo 配置 (slug: zenmind-react-app)
├── package.json
├── tsconfig.json                    # extends expo/tsconfig.base, strict: false
├── jest.config.js                   # preset: jest-expo
├── CLAUDE.md                        # Claude Code AI 开发指南
├── assets/                          # 图标、启动图
└── src/
    ├── app/                         # 应用壳层
    │   ├── AppRoot.tsx
    │   ├── providers/AppProviders.tsx
    │   ├── shell/
    │   │   ├── ShellScreen.tsx      # 主容器 (1500+ 行)
    │   │   ├── shellSlice.ts
    │   │   └── DomainSwitcher.tsx
    │   └── store/
    │       ├── store.ts             # Redux store (5 slice + 3 RTK Query API)
    │       └── hooks.ts
    ├── core/                        # 核心基础设施
    │   ├── auth/
    │   │   ├── appAuth.ts           # 鉴权: 登录/登出/刷新/session
    │   │   └── webViewAuthBridge.ts # WebView 鉴权桥接协议
    │   ├── constants/theme.ts       # light/dark 主题
    │   ├── network/
    │   │   ├── apiClient.ts         # fetch 封装 + ApiEnvelope 解析
    │   │   └── endpoint.ts          # URL 规范化
    │   ├── storage/settingsStorage.ts
    │   └── types/common.ts
    ├── modules/
    │   ├── chat/                    # 聊天助理 (最复杂模块)
    │   ├── terminal/                # PTY 终端 (WebView)
    │   ├── agents/                  # 智能体管理
    │   └── user/                    # 用户设置
    └── shared/                      # 共享 UI / 工具 / 动画
```

## 架构概览

### 四域单壳架构

`ShellScreen` 是应用唯一主容器，不使用 React Navigation，通过 `activeDomain` 状态条件渲染四个域屏幕：

| 域 | 屏幕组件 | 说明 |
|----|----------|------|
| `chat` | `ChatAssistantScreen` | AI 聊天助理，SSE 流式对话 |
| `terminal` | `TerminalScreen` | PTY 终端，WebView 包装 |
| `agents` | `AgentsScreen` | 智能体列表与管理 |
| `user` | `UserSettingsScreen` | 应用设置 |

域切换由 `DomainSwitcher` 组件触发，状态持久化到 AsyncStorage。

### 状态管理

Redux Toolkit 配置：

| Slice | 职责 |
|-------|------|
| `shell` | 抽屉开关 |
| `user` | 主题/端点/域/设置 |
| `agents` | 智能体列表与选中状态 |
| `chat` | 聊天列表/选中 chatId/关键词 |
| `terminal` | PTY 加载/会话/重载 |

RTK Query API: `chatApi`, `agentsApi`, `terminalApi` (均使用 `fakeBaseQuery` + 自定义 `queryFn`)

聊天时间线数据存储在 `ChatAssistantScreen` 组件本地 state（非 Redux），通过 `eventReducer` 构建。

### 鉴权系统

- 主密码登录 -> 获取 `accessToken` + `deviceToken`
- `deviceToken` 持久化到 AsyncStorage，用于无感刷新
- `accessToken` 短期有效，过期自动刷新
- 前台保活: App 回到 `active` 时预刷新 (debounce 20s) + 每 60s 定时刷新
- WebView 鉴权桥接: `auth_token` / `auth_refresh_request` / `auth_refresh_result` 三种消息类型

### SSE 流式聊天

```
POST /api/query (SSE)
  -> XMLHttpRequest onprogress
  -> parseSseBlock()          # SSE 文本 -> JSON
  -> applyEvent()             # 路由分发
  -> reduceChatEvent()        # 纯函数构建时间线
  -> handleEffects()          # 副作用执行
  -> React setState()         # FlatList 渲染
```

## 后端 API 协议

所有 API 统一返回 `ApiEnvelope<T>` 格式：`{ code: 0, msg?: string, data: T }`

鉴权方式: `Authorization: Bearer <accessToken>`

### 鉴权

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 主密码登录 |
| POST | `/api/auth/refresh` | 刷新 accessToken |
| POST | `/api/auth/logout` | 登出当前设备 |

### 业务

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/agents` | 智能体列表 |
| GET | `/api/chats` | 聊天摘要列表 |
| GET | `/api/chat?chatId=...` | 聊天历史事件 |
| GET | `/api/viewport?viewportKey=...` | Frontend Tool HTML |
| POST | `/api/query` | 流式聊天 (SSE) |
| POST | `/api/submit` | 提交 Frontend Tool 结果 |

### 消息盒子

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/app/inbox?limit=N` | 收件箱消息 |
| GET | `/api/app/inbox/unread-count` | 未读数 |
| POST | `/api/app/inbox/read` | 标记已读 |
| POST | `/api/app/inbox/read-all` | 全部已读 |

### WebSocket 推送

| 端点 | 事件 |
|------|------|
| `ws(s)://.../api/app/ws?access_token=...` | `inbox.new` / `inbox.sync` / `chat.new_content` |

### 终端 (PTY 前端服务)

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `{ptyWebUrl}/appterm/api/sessions` | 终端会话列表 |
| POST | `{ptyWebUrl}/appterm/api/sessions` | 创建终端会话 |

## 配置存储

- 当前 key: `mobile_app_settings_v3`
- 设备令牌 key: `app_device_token_v2`
- 启动时自动清理旧版本 key (`v1`, `v2`)

## License

Private
