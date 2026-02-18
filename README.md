# agw-react-app (React Native)

这是一个基于 React Native + WebView 的 AGW 移动端骨架，主要交互界面放在内嵌 HTML 中，后端对接 `agw-springai-agent` 的 `/api/*` 协议。

## 已实现

- `WebView` 内置 HTML 聊天壳层（可后续替换成你的 React Web 页面）。
- Agent 列表拉取：`GET /api/agents`。
- 对话请求：`POST /api/query`（SSE 事件解析）。
- Viewport 拉取：`GET /api/viewport`。
- 前端工具提交：`POST /api/submit`。
- 顶部可配置后端地址（默认 `http://10.0.2.2:8080`，适用于 Android 模拟器）。

## 启动

```bash
npm install
npm run android
```

或：

```bash
npm run start
```

然后用 Expo Go / Android 模拟器运行。

## 真机连接后端

如果你在 Android 真机上调试，`10.0.2.2` 不可用。请把顶部地址改成你电脑局域网 IP，例如：

```text
http://192.168.1.25:8080
```

同时确保：

- 手机和电脑在同一局域网。
- `agw-springai-agent` 已启动并监听该地址。
- 防火墙允许 8080 入站访问。

## 结构

- `App.js`: React Native 宿主 + WebView 与后端桥接。
- `src/webShellHtml.js`: 内嵌 HTML 交互界面。
