# Shell 模块说明

## 目录职责
- `ShellScreen.tsx`: Shell 容器，负责状态编排、副作用（鉴权、WebSocket、数据同步）和页面装配。
- `ShellScreen.styles.ts`: Shell 统一样式定义，避免主文件混杂视觉细节。
- `components/ShellTopNav.tsx`: 顶部导航组件，仅负责渲染和事件转发。
- `routes/shellRouteModel.ts`: 显式路由视图模型，将 Redux 状态映射为可渲染路由语义。
- `shellSlice.ts`: Shell 级路由状态（`chatRoute`/`chatOverlayStack`/`terminalPane` 等）与动作。
- `BottomDomainNav.tsx`: 底部域导航组件。

## 路由模型
`buildShellRouteModel` 将以下状态转换为统一视图结果：
- 域路由：`chat | terminal | agents | user`
- Chat 子路由：`list | search`
- Chat 覆盖层：`chatDetail | agentDetail`
- Terminal 子路由：`list | detail`

输出的 `ShellRouteModel` 包含：
- 当前是否在某个域（`isChatDomain` 等）
- 顶栏形态（`isChatListTopNav`、`topNavTitle`、`topNavSubtitle`）
- 底栏显隐（`showBottomNav`）

## 维护建议
- 新增页面时，先扩展 `shellSlice` 的状态与 action，再扩展 `shellRouteModel`，最后在 `ShellScreen` 装配页面。
- 组件内避免直接拼装复杂路由判断，统一复用 `ShellRouteModel` 字段。
- 业务副作用（网络、鉴权、WS）继续集中在 `ShellScreen`，UI 组件保持“无副作用”。
