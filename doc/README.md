# ZenMind Mobile Docs

本目录用于描述当前项目的实际代码结构、模块职责和主要运行链路。

## 文档索引

- [模型知识库入口](./kb/root.json)
- [项目架构总览](./project-architecture.md)
- [模块说明清单](./module-reference.md)
- [移动端视觉主题](./ui-visual-theme.md)

## 知识库维护

`doc/kb/root.json` 是模型读取项目知识的唯一主入口，`project-architecture.md` 和 `module-reference.md`
保留为背景材料。

常用命令：

```bash
pnpm kb:build
pnpm kb:validate
pnpm kb:check-stale
```

## 适用范围

以下内容基于当前仓库代码整理，重点覆盖：

- 应用入口与导航结构
- 基础能力层（环境变量、统一 API 调用）
- 聊天列表持久化与本地数据库
- WebSocket 实时同步链路
- 通用列表组件

## 当前项目定位

当前项目是一个 Expo 56 / React Native 0.85 的移动端骨架项目，已经具备以下基础能力：

- 4 个底部 Tab：`Chat` / `Terminal` / `Drive` / `Me`
- 开发环境悬浮 `Debug` 按钮
- 统一 API 请求封装
- `FlashList` 分页列表组件
- `MMKV + SQLite/Drizzle + WebSocket` 的聊天持久化与实时同步样例

其中：

- `Chat` Tab 已接入完整示例
- `Terminal`、`Drive`、`Me` 目前仍是占位页面

## 维护原则

- SQLite 是聊天数据的唯一真源
- MMKV 只保存首页启动快照，不承担完整数据库职责
- WebSocket 只处理连接和消息收发，不直接操作 UI
- 业务页面优先通过 repository / service 层取数，不直接拼接底层细节
