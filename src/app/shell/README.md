# Shell 模块说明

## 目录职责

- `ShellScreen.tsx`: Shell 容器，负责状态编排、副作用（鉴权、WebSocket、数据同步）和页面装配。
- `ShellScreen.styles.ts`: Shell 统一样式定义，避免主文件混杂视觉细节。
- `components/ShellScreenView.tsx`: Shell 视图层，负责 root tab、统一 stack 注册、路由快照聚合与壳层级 UI 编排。
- `components/ShellTopNav.tsx`: 顶部导航外壳和少量 header 原子组件，只负责统一布局与视觉样式。
- `routes/shellHeaderModel.tsx`: 根据当前 shell 路由快照和少量业务状态，纯派生出当前 header descriptor。
- `hooks/useShellRouteBridge.ts`: route screen 复用的导航桥接 hook，只负责 `onBindNavigation` 与 focus 回调同步。
- `routes/shellRouteSnapshot.ts`: 导航焦点快照，将真实 focus route 映射为 shell 可消费的 `chatMode` / `chatOverlayType` / `terminalPane`。
- `routes/shellRouteModel.ts`: 在 route snapshot 之上生成统一的壳层视图模型（主要用于底栏显隐）。
- `shellSlice.ts`: 纯 UI slice，只保留 chat 搜索、侧边栏、详情抽屉等面板状态，不再承载路由历史。
- `BottomDomainNav.tsx`: 底部域导航组件。

## 路由模型

Shell 以 React Navigation 的实际焦点路由为唯一真相源：

- 域路由：`chat | apps | terminal | drive | user`
- Apps 栈路由：`AppsList | AppsWebView`
- Chat 栈路由：`ChatList | ChatSearch | ChatDetail | AgentProfile`
- Terminal 栈路由：`TerminalList | TerminalDetail | TerminalDrive`
- Drive 一级页：`Drive`

`buildShellRouteSnapshot` 会把上述焦点状态收敛为：

- `appsPane`: `list | detail`
- `chatMode`: `list | search`
- `chatOverlayType`: `'' | 'chatDetail' | 'agentDetail'`
- `terminalPane`: `list | detail | drive`

`buildShellRouteModel` 再基于 snapshot 输出壳层级状态：

- 当前是否在某个域（`isChatDomain`、`isAppsDomain` 等）
- Drive 一级单页与 `TerminalDrive` 共享同一份网盘内容组件
- 底栏显隐（`showBottomNav`）

页面级 header 不再由 `ShellScreenView` 手写巨量布尔分支，也不再通过运行时注册；各页面旁边导出自己的 header builder，由 `shellHeaderModel` 按当前路由纯派生出 `left / center / right` slot。

可导航域（chat / apps / terminal）的返回行为也不再通过 `bindXxxNavigation` / `goBackOrNavigateXxxList` 成对扩展，而是统一走 route bridge + shell stack registry。

## 维护建议

- 新增页面时，优先扩展对应 navigator 的 route name；如果只影响页面 header，直接在页面旁边新增或调整 header builder，不要再给 shell 增加新的布尔分支或新的运行时同步状态。
- `activeDomain` 只作为持久化投影和少量业务副作用来源，不再驱动页面切换。
- 组件内避免直接拼装跨域路由判断；页面只声明自己的 header 结构，壳层只消费纯派生结果。
- 业务副作用（网络、鉴权、WS）继续集中在 `useShellScreenController`，视图层只做导航监听和 UI 编排。
