# agw-react-app (React Native + TypeScript)

AGW 移动端已从单体 `App.js` 重构为四业务域分层架构：

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

- `/Users/linlay-macmini/Project/agw-react-app/src/app`：应用壳层、Provider、Store、Shell
- `/Users/linlay-macmini/Project/agw-react-app/src/core`：网络/配置/存储/基础类型
- `/Users/linlay-macmini/Project/agw-react-app/src/modules/chat`：聊天主域（SSE、事件归一化、事件 reducer、时间线渲染）
- `/Users/linlay-macmini/Project/agw-react-app/src/modules/terminal`：PTY 终端管理
- `/Users/linlay-macmini/Project/agw-react-app/src/modules/agents`：智能体管理
- `/Users/linlay-macmini/Project/agw-react-app/src/modules/user`：用户配置
- `/Users/linlay-macmini/Project/agw-react-app/src/shared`：共享 UI、工具函数、动画

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

## 环境变量（后端地址）

- 变量名：`EXPO_PUBLIC_AGW_ENDPOINT`
- 规则：
  - 若设置该变量，优先使用它作为默认后端地址
  - 若未设置，开发态默认 `http://localhost:11946`
  - 若未设置，生产态默认 `agw.linlay.cc`

示例：

```bash
EXPO_PUBLIC_AGW_ENDPOINT=http://localhost:11946 npm run start
```

## 后端协议

接口保持不变：

- `GET /api/agents`
- `GET /api/chats`
- `GET /api/chat?chatId=...`
- `GET /api/viewport?viewportKey=...`
- `POST /api/query`（SSE）
- `POST /api/submit`

## 配置存储迁移

- 旧 key：`agw_mobile_chat_settings_v1`
- 新 key：`agw_mobile_app_settings_v2`

应用会在首次启动时自动迁移。
