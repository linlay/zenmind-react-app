# ZenMind Mobile UI Theme

这份文档用于固化当前移动端视觉主题。后续新增页面或改造现有 UI，默认按这里的语言落地，而不是为单个需求临时拼一套风格。

## 主题目标

- 观感方向：接近系统级聊天列表与成熟工具类产品，参考 Linear / Stripe Dashboard 的低噪声层级，强调信息扫描效率。
- 气质关键词：克制、现代、专业、清晰、列表优先。
- 视觉重心：先保证信息层级和可读性，再谈装饰。

## 默认视觉语言

### 1. 颜色

- 亮色默认：使用 `#fafafb` 中性近白画布和纯白表面，一级页面不铺大面积彩底或淡蓝底。
- 暗色默认：背景、表面、分隔线和遮罩必须从 `appThemeTokens.dark.colors` 获取，不在页面里临时调色。当前暗色基准来自 Stitch 企业移动端规范，采用中性炭黑层级、蓝色关键强调和细边框定义边界。
- 表面：亮色以白色为主，暗色以深色表面为主，只在输入区、轻按钮容器和弱状态块上使用 muted surface。
- 半透明导航：`tabBarSurface` 只服务底部导航玻璃层；它要与 `backgroundMuted` 保持清晰但克制的冷灰层级差，亮色与暗色都维持较高不透明度，避免滚动内容穿透后干扰图标和标签。`tabBarBorder` 专门提供比画布和导航表面更明确的顶部边界。
- 主强调：`brandBlue` 只用于链接、焦点、激活 tab 和少量运行状态；普通图标、section label 与通用状态不使用蓝色。`brandBlueAction` 只用于实心关键操作、未读徽标、用户消息气泡和主提交按钮，前景固定使用 `onBrandBlueAction`。
- 辅助色：少量使用绿色、橙色、青色等作为头像识别色，而不是整页主题色。
- 文本：主标题和正文使用当前主题的 textPrimary，描述和时间使用 textSecondary / textTertiary，避免额外制造复杂文本层级。

亮色中性核心色值：

| 语义   | token             | 色值      |
| ------ | ----------------- | --------- |
| 画布   | `background`      | `#fafafb` |
| 弱画布 | `backgroundMuted` | `#f5f6f7` |
| 表面   | `surface`         | `#ffffff` |
| 弱表面 | `surfaceMuted`    | `#f1f2f4` |
| 主文本 | `textPrimary`     | `#1b1d21` |
| 次文本 | `textSecondary`   | `#666b73` |
| 弱文本 | `textTertiary`    | `#9297a0` |
| 分隔线 | `line`            | `#e7e8eb` |

暗色核心色值：

| 语义       | token               | 色值                     | 用途                               |
| ---------- | ------------------- | ------------------------ | ---------------------------------- |
| 画布       | `background`        | `#101114`                | app 根背景、详情页背景             |
| 弱画布     | `backgroundMuted`   | `#141518`                | 一级页滚动底、弱分区背景           |
| 表面       | `surface`           | `#18191c`                | Header、TabBar、分组卡片、输入容器 |
| 弱表面     | `surfaceMuted`      | `#202126`                | 列表按压、输入底、图标底、选中弱底 |
| 抬升表面   | `surfaceRaised`     | `#25262b`                | 浮层、按压态、需要更高层级的容器   |
| Tab 玻璃面 | `tabBarSurface`     | `rgba(24, 25, 28, 0.94)` | iOS / Web 底部导航半透明底色       |
| Tab 顶边界 | `tabBarBorder`      | `#34373d`                | 底部导航顶部的明确单像素边界       |
| 分隔线     | `line`              | `#2b2d31`                | 行分隔、轻边界                     |
| 强边界     | `lineStrong`        | `#3a3d43`                | 卡片、输入框、抽屉边界             |
| 主前景蓝   | `brandBlue`         | `#afc6ff`                | 激活 tab、线性图标、链接           |
| 实心蓝     | `brandBlueAction`   | `#1677ff`                | CTA、发送、未读、用户气泡          |
| 实心蓝前景 | `onBrandBlueAction` | `#ffffff`                | 实心蓝上的文字和图标               |
| 主文本     | `textPrimary`       | `#f1f2f4`                | 标题、正文                         |
| 辅助文本   | `textSecondary`     | `#b5b8bf`                | 描述、详情                         |
| 弱文本     | `textTertiary`      | `#7f848d`                | 时间、占位、禁用                   |

唯一主题 token 来源：`src/shared/visual/foundation.tokens.json`，`src/shared/visual/foundation.ts` 从该 JSON 派生运行时 token，`tailwind.config.js` 从同一份 JSON 派生 NativeWind/Tailwind 语义 class token。运行时主题入口是 `src/shared/visual/AppThemeProvider.tsx`，偏好支持 `system` / `light` / `dark`；`system` 只解析为当前系统的 light/dark 生效主题，不新增第三套颜色 token，并通过 MMKV 同步读取用户偏好以避免首帧闪烁，同时同步 NativeWind color scheme 让未来 Tailwind 静态样式跟随主题切换。

## 2. 布局

- 一级页面保持固定 Header 在滚动区外。
- 会话首页优先是纯列表，不额外叠 hero 卡、摘要卡和大块装饰。
- 会话首页使用 `backgroundMuted` 作为滚动画布，目录行继续使用 `surface`；亮色下形成近白画布与纯白内容面的轻微层次。
- 页面结构优先通过留白、字号和时间/状态对齐建立层级，而不是靠重卡片。
- 底部导航默认贴底，页面内容避让必须跟随真实 tab bar 高度。

## 3. 组件形态

- 圆角：整体适中，头像和徽标保持圆形，按钮和输入区用小到中等圆角。
- 图标：统一使用线性风格图标，不混入多套图标风格。
- 操作按钮：优先系统感图标按钮和轻边框按钮；实心主按钮只能使用 `brandBlueAction` / `onBrandBlueAction`，不要复用 `brandBlue` 做按钮底色。
- 输入框：背景使用 `surfaceMuted`，边框使用 `lineStrong`，placeholder 使用 `textTertiary`，焦点态使用 `brandBlue` 或 `brandBlueAction`。
- 卡片：默认不用大卡片包页面内容；若必须分组，暗色下使用 `surface` 或 `surfaceMuted` 加 `lineStrong` 细边框，不给每个分组叠阴影。
- 底部 Tab：亮色使用接近白色的冷灰玻璃面，暗色比页面画布抬高一个层级；iOS 亮色使用 `systemMaterialLight`、暗色使用 `systemMaterialDark`，Web 只在整条 Tab 上使用单层 backdrop blur，Android 使用高不透明度 `tabBarSurface` 形成稳定色面边界。顶部边界使用 `tabBarBorder`，Web 在模糊层上方固定绘制 1px，激活态使用 `brandBlue`。内容避让继续来自真实 safe area / tab bar height。
- 会话目录行：常态统一使用 `surface`，置顶只通过置顶图标表达，不用永久底色染色；按压、菜单目标等瞬时状态才使用 muted 背景。

## 4. 列表与性能

- 高频长列表默认平面化，不给每一行叠阴影、渐变或厚重 elevation。
- 模糊只允许出现在底部 Tab 的单一合成层，不把 blur、filter 或透明动画放进 FlashList item 热路径。
- 列表容器优先复用 `PaginatedCardList`，保持固定项高和统一分页行为。
- 视觉层次优先落在头像色块、标题粗细、摘要灰度和右侧时间/未读区，不靠每个 item 单独造重层级。
- 静态样式默认优先使用 NativeWind/Tailwind `className` 常量；保留 `style` 时必须能归因为真实动态值、动画值、运行时测量、safe area / tab bar / keyboard inset、服务端/品牌/头像动态颜色、WebView/CameraView/FlashList/公开 `style` API 或阴影 `shadowColor` / elevation。
- 高频组件不要在列表 item render 内临时拼整套样式对象；有限状态用稳定 className 分支或 `cn(...)` 合并，动态 style 保持最小对象。
- 主题切换只换 token 引用，不新增跨 screen 的主题状态和订阅，不触碰 SQLite、WebSocket 或业务缓存。

## 5. 复用入口

改 UI 时优先从这些入口收口：

- `src/shared/visual/foundation.ts`
- `src/shared/visual/foundation.tokens.json`
- `src/shared/visual/AppThemeProvider.tsx`
- `src/shared/visual/themePreference.ts`
- `src/shared/visual/AppLineIcon.tsx`
- `src/shared/components/ScreenHeader.tsx`
- `src/shared/components/PaginatedCardList.tsx`
- `src/app/screens/AppScreenFrame.tsx`

## 6. 禁止项

- 不为单个页面硬编码一套新的颜色、圆角、间距体系。
- 不在页面里手算底部 Tab 避让值。
- 不给长列表逐项增加阴影、渐变、发光或复杂装饰。
- 不为追求跨平台像素一致而替换 Native Bottom Tabs；Android 无原生等价模糊时使用稳定实色降级。
- 不把视觉风格判断散落到业务模块；主题语义优先回收到 shared visual 层。
- 不在 screen 内直接读写主题 MMKV；页面只通过 `useAppTheme` 和 `setThemePreference` 进入共享主题边界。

## 7. 改 UI 时的快速检查

- 静态样式是否优先使用 NativeWind/Tailwind `className`，而不是新增 `StyleSheet.create`？
- 是否先复用了 `appVisualTokens` / `appThemeTokens` / Tailwind 语义 class token，而不是直接写颜色字面量？
- 实心主操作是否使用 `brandBlueAction` / `onBrandBlueAction`，而不是把 `brandBlue` 同时当按钮底色？
- Header 是否固定在滚动区外？
- 底部留白是否来自真实 `tab bar height` / `safe area`？
- 长列表是否保持平面，而不是逐项堆阴影？
- 新页面在亮色和暗色下是否仍然属于同一套平面列表 + 蓝色主强调 + 灰色辅助信息？
