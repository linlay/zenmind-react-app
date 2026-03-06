# Shell 模块说明

## 目录职责

- `ShellScreen.tsx`: Shell 容器，负责状态编排、副作用（鉴权、WebSocket、数据同步）和页面装配。
- `ShellScreen.styles.ts`: Shell 统一样式定义，避免主文件混杂视觉细节。
- `components/ShellScreenView.tsx`: Shell 视图层，负责绑定 root tab / chat stack / terminal stack 的 focus listener，并把导航焦点投影为统一 shell 路由状态。
- `components/ShellTopNav.tsx`: 顶部导航组件，仅负责渲染和事件转发。
- `routes/shellRouteSnapshot.ts`: 导航焦点快照，将真实 focus route 映射为 shell 可消费的 `chatMode` / `chatOverlayType` / `terminalPane`。
- `routes/shellRouteModel.ts`: 在 route snapshot 之上生成统一的视图模型（标题、副标题、底栏显隐等）。
- `shellSlice.ts`: 纯 UI slice，只保留 chat 搜索、侧边栏、详情抽屉等面板状态，不再承载路由历史。
- `BottomDomainNav.tsx`: 底部域导航组件。

## 路由模型

Shell 以 React Navigation 的实际焦点路由为唯一真相源：

- 域路由：`chat | terminal | agents | user`
- Chat 栈路由：`ChatList | ChatSearch | ChatDetail | AgentProfile`
- Terminal 栈路由：`TerminalList | TerminalDetail | TerminalDrive`

`buildShellRouteSnapshot` 会把上述焦点状态收敛为：

- `chatMode`: `list | search`
- `chatOverlayType`: `'' | 'chatDetail' | 'agentDetail'`
- `terminalPane`: `list | detail | drive`

`buildShellRouteModel` 再基于 snapshot 输出：

- 当前是否在某个域（`isChatDomain` 等）
- 顶栏形态（`isChatListTopNav`、`topNavTitle`、`topNavSubtitle`）
- 底栏显隐（`showBottomNav`）

## 维护建议

- 新增页面时，优先扩展对应 navigator 的 route name，再补 `shellRouteSnapshot` / `shellRouteModel` 的映射，不要回到 Redux 里维护并行路由状态。
- `activeDomain` 只作为持久化投影和少量业务副作用来源，不再驱动页面切换。
- 组件内避免直接拼装复杂路由判断，统一复用 `ShellRouteModel` 字段。
- 业务副作用（网络、鉴权、WS）继续集中在 `useShellScreenController`，视图层只做导航监听和 UI 编排。
