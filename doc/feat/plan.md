问：这个功能我要更高性能的解决方案，并且还需要返回一级页面（对话列表）的时候，底部tab栏不会突然出现，我觉得这个不同层级页面对tab栏做不同的显示逻辑这个方案体感非常差，我想要那种点击列表item后唰一下二级页面从右侧淡入，左侧边缘右滑返回又唰一下二级页面从右侧淡出，像是直接盖在一级页面那种效果，底部tab栏也不用更改展示状态了，帮我规划一个高性能的（p0），优雅的(p0)，好维护(p1)的解决方案，并且不允许引入屎山代码和冗余逻辑。给出一个改造方案

答：

**结论**

要同时满足你要的 3 件事：

- `P0` 高性能
- `P0` 交互体感自然
- `P1` 易维护且不堆屎山

最优方案不是继续补当前 [ChatWorkspaceScreen.tsx](/Users/ther/project/git/zenmind/zenmind-mobile/src/features/chatPersistence/ChatWorkspaceScreen.tsx:12) 这套“页面内覆盖层 + 手写动画 + 手写 back + tab 显隐”的逻辑，而是把聊天详情提升为**真正的上层路由**。

**推荐方案**

用 `@react-navigation/native-stack` 做一个 root stack：

- `RootStack`
  - `Tabs`
  - `ChatDetail`

`Tabs` 继续承载现有底部 tab。
`ChatDetail` 放在 `Tabs` 上面，作为真正的二级页面。

这样会天然得到：

- 详情页从右侧 push 进来，原生栈动画更稳。
- 返回时原生 pop，iOS 左边缘右滑返回直接生效。
- 底部 tab 不再“隐藏/显示切换”，而是始终存在，只是被 `ChatDetail` 这个上层页面自然盖住。
- 一级页列表不会卸载，滚动位置、分页状态、列表实例都保留。
- 不需要再手写 `BackHandler`、手写 route overlay、手写 tabBarStyle 切换。

**为什么这是当前唯一正确方向**

当前方案的问题，不是参数没调好，而是方向不对：

- 现在的详情页覆盖层在 `Chat` tab 场景内部，天然和 tab bar 处于不同层级。
- 为了盖住 tab，你只能：
  1. 动态隐藏 tab bar
  2. 在 app shell 再造一个全局 overlay host
  3. 用 `Modal` + 自定义手势

这三条路里：

- `1` 体感差，你已经明确否定。
- `2` 会开始长出上下文、事件桥、覆盖层控制器，维护成本上升。
- `3` 想做到原生边缘返回和高性能交互，最终还是会走到手势库/动画库，不比 native stack 更干净。

所以继续 patch 当前 [ChatWorkspaceScreen.tsx](/Users/ther/project/git/zenmind/zenmind-mobile/src/features/chatPersistence/ChatWorkspaceScreen.tsx:12) 只会越来越像屎山。

**改造方案**

1. 新增依赖  
   只加 `@react-navigation/native-stack`。  
   先不要加 `reanimated`、`gesture-handler`，避免过度建设。

2. 重构导航层  
   改 [RootNavigator.tsx](/Users/ther/project/git/zenmind/zenmind-mobile/src/app/navigation/RootNavigator.tsx:1) 为：

- 外层 `NativeStackNavigator`
- 内层保留现有 bottom tabs

3. 新增路由类型  
   在 [types.ts](/Users/ther/project/git/zenmind/zenmind-mobile/src/app/navigation/types.ts:1) 增加：

- `RootStackParamList`
- `ChatDetail: { conversationId: string; initialConversation?: ChatHomeItem }`

4. 精简 Chat 入口  
   让 `ChatScreen` / `ChatHomeScreen` 只负责列表，不再持有“当前详情页是否打开”的本地 route 状态。  
   点击列表 item 时直接 `navigate('ChatDetail', params)`。

5. 详情页改成标准 route screen  
   把 [ChatDetailScreen.tsx](/Users/ther/project/git/zenmind/zenmind-mobile/src/features/chatPersistence/ChatDetailScreen.tsx:253) 改为：

- 从 route params 取 `conversationId`
- 返回走 `navigation.goBack()`
- 删除 `onBack` prop 依赖

6. 删除当前临时覆盖层方案  
   删除 [ChatWorkspaceScreen.tsx](/Users/ther/project/git/zenmind/zenmind-mobile/src/features/chatPersistence/ChatWorkspaceScreen.tsx:12) 里的这些逻辑：

- `activeConversation`
- 手写 `Animated` 路由过渡
- `BackHandler`
- `tabBarStyle` 动态切换
- `isForeground` 这类为覆盖层补出来的控制逻辑

7. 列表订阅改为“按导航焦点工作”  
   `ChatHomeScreen` 内部用导航焦点控制订阅和刷新，不再依赖外部覆盖层传状态。  
   这样 detail push 到 stack 顶层时，列表自然失焦，后台同步自动停掉。

**关键配置**

`ChatDetail` 的 stack options 建议：

- `headerShown: false`
- `animation: 'slide_from_right'`
- `gestureEnabled: true`

这就是你要的“唰一下从右侧盖上来，再唰一下从右侧退回去”的正确来源。

**最终效果**

改完后交互会变成：

- 点击列表 item：详情页作为上层 route 从右侧推入，像盖在列表上。
- tab bar 不做任何显隐切换，只是被上层页面自然遮住。
- iOS 左边缘右滑：原生交互式返回。
- 返回一级页：列表位置、分页状态、实例都还在。
- Android：系统返回回到列表，不再需要手写 back patch。

**维护性判断**

这是我给你的优先级结论：

- `P0` 性能：`native-stack`
- `P0` 体验：tab 不切状态，详情自然覆盖
- `P1` 维护：让导航系统管理“页面层级”，业务组件只关心数据和 UI

继续基于当前自定义 overlay 方案优化，我不建议。那条路很快就会进入“能跑，但越来越难收拾”。
