# agent-terminal-app (React Native + TypeScript)

Agent 移动端已从单体 `App.js` 重构为四业务域分层架构：

- 聊天助理（主域）
- 终端管理（PTY WebView）
- 智能体管理（本地静态 WebView 占位）
- 用户管理与配置（原生设置 + 本地静态 WebView 占位）

## 技术栈

- React Native (Expo)
- TypeScript
- Redux Toolkit
- RTK Query
- WebView

## 目录

- `/Users/linlay-macmini/Project/agent-terminal-app/src/app`：应用壳层、Provider、Store、Shell
- `/Users/linlay-macmini/Project/agent-terminal-app/src/core`：网络/配置/存储/基础类型
- `/Users/linlay-macmini/Project/agent-terminal-app/src/modules/chat`：聊天主域（SSE、事件归一化、事件 reducer、时间线渲染）
- `/Users/linlay-macmini/Project/agent-terminal-app/src/modules/terminal`：PTY 终端管理
- `/Users/linlay-macmini/Project/agent-terminal-app/src/modules/agents`：智能体管理
- `/Users/linlay-macmini/Project/agent-terminal-app/src/modules/user`：用户配置
- `/Users/linlay-macmini/Project/agent-terminal-app/src/shared`：共享 UI、工具函数、动画

## 启动

```bash
npm install
npm run start
```

## 常用命令

```bash
npm run typecheck
npm run test
npm run build
```

## 打包与发布

本项目使用 Expo + EAS Build，推荐按下面三种场景区分：

### 1) 开发调试（二维码扫码打开，非安装包）

```bash
npm run start
```

- 终端会显示 Expo 二维码。
- Android 用 Expo Go 扫码可直接打开调试包（要求手机和电脑网络可互通）。

### 2) 安卓内部分发（二维码扫码下载安装 APK）

这是你说的“安卓扫码下载”方式，使用 EAS `internal` 分发：

```bash
npx eas login
npx eas build -p android --profile preview
```

- 本仓库 `eas.json` 的 `preview` 已配置：
  - `distribution: internal`
  - `android.buildType: apk`
- 构建完成后，EAS 会提供一个安装页面链接和二维码。
- Android 手机扫码后可直接下载并安装 APK（首次可能需要允许“安装未知来源应用”）。

### 3) 正式发布（Google Play）

```bash
npx eas build -p android --profile production
npx eas submit -p android --profile production
```

- `production` 通常用于商店分发（默认构建 AAB，更适合 Google Play）。
- 提交前请先在 Google Play Console 完成应用和签名相关配置。

## 环境变量（后端地址）

- 变量名：`EXPO_PUBLIC_BACKEND_ENDPOINT`
- 规则：
  - 若设置该变量，优先使用它作为默认后端地址
  - 若未设置，开发态默认 `app.linlay.cc`
  - 若未设置，生产态默认 `app.linlay.cc`

示例：

```bash
EXPO_PUBLIC_BACKEND_ENDPOINT=app.linlay.cc npm run start
```

默认 PTY WebView 地址会按后端地址生成：`https://{host}/appterm`。  
本地调试推荐：`http://localhost:11931/appterm`。

## 后端协议

接口保持不变：

- `GET /api/agents`
- `GET /api/chats`
- `GET /api/chat?chatId=...`
- `GET /api/viewport?viewportKey=...`
- `POST /api/query`（SSE）
- `POST /api/submit`

## WebView 鉴权桥接协议

为减少 App 从后台切回前台后的 WebView 401，当前实现采用“App 主动预刷新 + WebView 401 兜底刷新”组合策略。

WebView 与 RN 之间的鉴权消息约定如下：

- `auth_refresh_request`（WebView -> RN）
  - 字段：`requestId`（建议唯一）、`source`（可选）
  - 触发时机：WebView 内任意 API 返回 401 或等价未授权错误
- `auth_refresh_result`（RN -> WebView）
  - 字段：`requestId`、`ok`、`accessToken`（`ok=true` 时）或 `error`（`ok=false` 时）
  - 含义：RN 已完成一次 refresh（单飞），WebView 根据结果重试或进入未登录态
- `auth_token`（RN -> WebView）
  - 字段：`accessToken`、`accessExpireAtMs`（可选）
  - 触发时机：WebView 首次加载、App 主动刷新成功、token 更新后广播

H5/WebView 侧职责：

- 遇到 401 时发送 `auth_refresh_request`
- 在收到 `auth_refresh_result` 成功回包前，排队待重放请求
- 成功后用新 token 重放，失败时清理状态并引导登录

RN 侧职责：

- 前台 `active` 时基于过期时间做预刷新（含抖动，避免同一时刻洪峰）
- 保留 401 场景的强制刷新兜底
- 多个 WebView 并发刷新请求时仅执行一次 refresh

## 配置存储迁移

- 旧 key：`mobile_chat_settings_v1`
- 旧 key：`mobile_app_settings_v2`
- 新 key：`mobile_app_settings_v3`
- 旧设备令牌 key：`app_device_token_v1`（已废弃）

当前版本采用不兼容升级策略，启动时会清理旧 key，不做自动迁移。
