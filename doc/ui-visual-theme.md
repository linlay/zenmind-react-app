# ZenMind Mobile UI Theme

这份文档用于固化当前移动端视觉主题。后续新增页面或改造现有 UI，默认按这里的语言落地，而不是为单个需求临时拼一套风格。

## 主题目标

- 观感方向：接近系统级聊天列表与工具类应用的移动端界面，强调信息扫描效率。
- 气质关键词：扁平、简约、轻快、清晰、列表优先。
- 视觉重心：先保证信息层级和可读性，再谈装饰。

## 默认视觉语言

### 1. 颜色

- 亮色默认：背景纯白或近白，一级页面尽量不铺大面积彩底。
- 暗色默认：背景、表面、分隔线和遮罩必须从 `appThemeTokens.dark.colors` 获取，不在页面里临时调色。
- 表面：亮色以白色为主，暗色以深色表面为主，只在输入区、轻按钮容器和弱状态块上使用 muted surface。
- 主强调：蓝色语义不变，用于顶部操作、未读徽标、激活 tab、关键交互和暗色下的同类状态。
- 辅助色：少量使用绿色、橙色、青色等作为头像识别色，而不是整页主题色。
- 文本：主标题和正文使用当前主题的 textPrimary，描述和时间使用 textSecondary / textTertiary，避免额外制造复杂文本层级。

唯一主题 token 来源：`src/shared/visual/foundation.ts`。运行时主题入口是 `src/shared/visual/AppThemeProvider.tsx`，偏好支持 `system` / `light` / `dark`；`system` 只解析为当前系统的 light/dark 生效主题，不新增第三套颜色 token，并通过 MMKV 同步读取用户偏好以避免首帧闪烁。

## 2. 布局

- 一级页面保持固定 Header 在滚动区外。
- 会话首页优先是纯列表，不额外叠 hero 卡、摘要卡和大块装饰。
- 页面结构优先通过留白、字号和时间/状态对齐建立层级，而不是靠重卡片。
- 底部导航默认贴底，页面内容避让必须跟随真实 tab bar 高度。

## 3. 组件形态

- 圆角：整体适中，头像和徽标保持圆形，按钮和输入区用小到中等圆角。
- 图标：统一使用线性风格图标，不混入多套图标风格。
- 操作按钮：优先系统感图标按钮和轻边框按钮，不做厚重按钮壳。
- 卡片：默认不用大卡片包页面内容；若必须分组，优先平面分区和细分隔线。

## 4. 列表与性能

- 高频长列表默认平面化，不给每一行叠阴影、渐变或厚重 elevation。
- 列表容器优先复用 `PaginatedCardList`，保持固定项高和统一分页行为。
- 视觉层次优先落在头像色块、标题粗细、摘要灰度和右侧时间/未读区，不靠每个 item 单独造重层级。

## 5. 复用入口

改 UI 时优先从这些入口收口：

- `src/shared/visual/foundation.ts`
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
- 不把视觉风格判断散落到业务模块；主题语义优先回收到 shared visual 层。
- 不在 screen 内直接读写主题 MMKV；页面只通过 `useAppTheme` 和 `setThemePreference` 进入共享主题边界。

## 7. 改 UI 时的快速检查

- 是否先复用了 `appVisualTokens` / `appThemeTokens` / `useAppThemeStyles`，而不是直接写颜色字面量？
- Header 是否固定在滚动区外？
- 底部留白是否来自真实 `tab bar height` / `safe area`？
- 长列表是否保持平面，而不是逐项堆阴影？
- 新页面在亮色和暗色下是否仍然属于同一套平面列表 + 蓝色主强调 + 灰色辅助信息？
