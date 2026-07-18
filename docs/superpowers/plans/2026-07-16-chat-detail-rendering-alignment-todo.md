# 对话详情渲染对齐 TODO

> 对比基准：`../agent-webclient`，静态代码审计日期为 2026-07-16。本文只记录对话详情渲染差异，不把无关页面或新业务能力带入范围。

**目标：** 按表格顺序逐项补齐 `zenmind-react-app` 的对话详情渲染；每个 TODO 都必须形成“事件识别 → timeline 归一 → 实时更新 → SQLite rich snapshot → history replay → UI 渲染 → 测试”的完整闭环。

**静态审计结论：** 7 项尚无专用渲染，16 项已接入基础链路但与 Web 仍有差距。

## 使用约定

- 状态只使用：`[ ] 未开始`、`[-] 进行中`、`[x] 已完成`、`[!] 阻塞`。
- 优先级：P1 是主要内容丢失或不可操作；P2 是已经可见但语义、交互或结构明显弱于 Web；P3 是辅助操作和指标补齐。
- 一次只对齐一个 ID；完成后在本表勾选，并在“完成记录”填写日期、变更文件和验证结果。
- 每项默认验证：聚焦测试、`pnpm typecheck`、`pnpm test`、`xgraph status`。
- 页面不得直接访问 SQLite、MMKV、WebSocket；提交类交互继续经 `chatSyncService`，持久化继续经 `chatRepository`。
- 新增依赖时只能修改 `package.json`，不得修改 lock 文件，也不得运行安装命令。
- WebView、HTML、SVG、ECharts 和 action runtime 必须先定义可信来源、消息白名单和失败降级，禁止执行未识别 action 或任意脚本。

## 已对接基线

这些能力已经具备基本闭环，不作为独立 TODO 重做；表中标注“基础”的能力仍需完成后面的差异项。

| 状态 | 基线 ID | 已对接类型 | 当前入口 | 备注 |
| --- | --- | --- | --- | --- |
| [x] | BASE-01 | 用户消息、助手消息、流式 Markdown | `ChatTimelineList.tsx`、`ConversationMarkdownRenderer.tsx` | 已支持消息气泡、流式更新和基础 Markdown。 |
| [x] | BASE-02 | reasoning / thinking | `RuntimeTimelineRow.tsx`、`runtimePayloadDescriptor.ts` | 已有推理节点和折叠展示。 |
| [x] | BASE-03 | planning 文本流 | `RuntimePlanningBlock.tsx` | 已能展示计划模式的文本阶段；不等于结构化 `plan.*` 面板。 |
| [x] | BASE-04 | tool / tool-group 基础展示 | `RuntimeTimelineRow.tsx`、`runtimePayloadRenderers.tsx` | 已能显示工具状态、参数和结果；递归数据展示仍见 TODO-15。 |
| [x] | BASE-05 | awaiting question / approval / form / plan | `ChatAwaitingDock.tsx`、`AwaitingFormViewport.native.tsx` | 已支持提交、回答摘要、密码遮罩和 form viewport；选项 HTML 预览仍见 TODO-16。 |
| [x] | BASE-06 | system error | `ChatSystemAlert.tsx` | 已有独立错误提示。 |
| [x] | BASE-07 | run 元信息基础 | `ChatTimelineList.tsx` 的 assistant footer | 已有时间、复制、重新生成等基础能力；过程折叠和衍生操作仍见 TODO-17～20。 |
| [x] | BASE-08 | usage 基础统计 | `ChatUsageHeaderBadge.tsx` | 已有 detail / run / compact usage 展示；主动压缩和性能指标仍见 TODO-21～22。 |

## 待对齐 TODO 表

| 状态 | ID | 优先级 | 差异分类 | 类型 / 范围 | 当前实现与差距 | `agent-webclient` 基准 | 完成定义 | 主要落点 / 依赖 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [x] | TODO-01 | P1 | 未接入专用渲染 | `source.publish` 来源结果 | 当前事件分类和 timeline kind 没有 `source`，来源事件会丢失或落入非专用路径。 | `eventProcessorSource.ts`、`SourceBlock.tsx` | `source.publish` 在实时 push、detail replay 和 SQLite snapshot 中生成稳定 source 节点；列表显示查询词、结果数和来源摘要；可展开查看 URL、标题、片段与元数据；空结果和异常有降级。 | `chatEventProtocol.ts`、`types.ts`、`timelineReducer.ts`、`timelineDisplay.ts`、新增 Source row；需协议、reducer、display、snapshot/replay 测试。 |
| [x] | TODO-02 | P1 | 未接入专用渲染 | 消息内 `viewport` fence | 当前 Markdown 将 `viewport` 当普通代码块；只有 awaiting form 有 viewport WebView，普通助手内容没有 segment 模型。 | `contentSegments.ts`、`ContentBlock.tsx`、`ViewportEmbed.tsx` | 流式内容能安全识别完整/未完整 fence；完整 viewport 与文本按原顺序混排；通过 feature service 获取 HTML；支持 loading、error、刷新和高度边界；普通代码块不被误判。 | 先扩展 timeline content segment 与 snapshot schema，再复用/抽取现有 awaiting viewport 基础设施；不得让 shared Markdown 反向依赖 chat feature。 |
| [x] | TODO-03 | P1 | 未接入专用渲染 | Frontend Tool 交互视口 | 当前仅实现 awaiting form 的 `frontend_awaiting_submit`，没有 active frontend tool 生命周期和工具提交桥接。 | `FrontendToolContainer.tsx`、conversation `activeFrontendTool` 状态 | 能从工具事件建立 active tool；加载对应 viewport；完成 `tool_init` 与允许的前端提交消息桥接；提交经 `chatSyncService`；正确处理 done、关闭、切换会话、超时和加载失败；未知消息不执行。 | 建议在 chat timeline/realtime 持有 active 状态，feature UI 承载 WebView；可复用 TODO-02 的安全 viewport 容器。 |
| [x] | TODO-04 | P1 | 已接入但有差距 | `artifact.publish` 资源卡 | 当前协议已归到 artifact，最终由 runtime descriptor 以通用 record / code 行展示，资源语义和操作丢失。 | `ArtifactPanel.tsx`、`AttachmentCard.tsx`、artifact processor | artifact item 归一为有类型的资源模型；显示名称、类型、大小、生成状态和摘要；支持受认证的预览/下载；图片、文本、PDF、未知格式均有明确策略；实时和回放一致。 | `chatEventProtocol.ts`、`types.ts`、`timelineReducer.ts`、`runtimePayloadDescriptor.ts` 或新增 Artifact row；资源请求走 core API/service。 |
| [x] | TODO-05 | P1 | 已接入但有差距 | `plan.*` 结构化计划 | 当前 plan 事件已分类并保留 payload，但展示仍是通用 record，没有计划标题、步骤状态、进度和完成摘要。 | `planning/index.tsx`、`PlanPanel.tsx` | `plan.create/update/complete` 合并成稳定计划实体；展示步骤状态、进行中项、完成度、耗时和失败状态；增量更新不重复插行；实时、snapshot 和 replay 结果一致。 | `types.ts`、`timelineReducer.ts`、`timelineDisplay.ts`、新增 Plan panel；TODO-06 复用其 plan/task 关系。 |
| [x] | TODO-06 | P1 | 已接入但有差距 | `task.*` / 子任务 / subagent 分组 | 当前 task 事件已分类但以通用 record 展示，无法看清父子层级、执行者、并行组和状态迁移。 | `PlanPanel.tsx` 的普通任务与 parallel agent 分组 | task 按 planId/parentId/runId 稳定归组；显示负责人/agent、父子关系、并行状态、开始/结束/错误；乱序事件和重复 replay 不产生重复任务；可从计划展开查看。 | 依赖 TODO-05 的结构化计划容器；补 task reducer 合并和乱序测试。 |
| [x] | TODO-07 | P1 | 已接入但有差距 | `action.*` 动作执行结果 | 当前 action 事件已分类，但只显示通用 record；没有 Web 的 action runtime 语义。 | `useActionRuntime.ts` 及 action processor | 先列出移动端允许的 action 白名单；允许项显示动作、目标、执行状态和结果；执行/提交经 service；重复事件幂等；未知或高风险 action 只展示不执行，并给出原因。 | `chatEventProtocol.ts`、`timelineReducer.ts`、新增 Action row/service；实现前需确定移动端白名单，禁止直接照搬浏览器 action。 |
| [ ] | TODO-08 | P2 | 已接入但有差距 | `context.compact.*` 语义提示 | 当前事件可进入 runtime/usage，但详情流中主要是通用 record，压缩前后状态不直观。 | context compact processor、`SystemAlert.tsx` 对应语义节点 | compact start/complete/error 显示为轻量系统提示；展示压缩前后 token、节省量和失败原因；与 header usage 数据一致；不重复显示原始 JSON。 | `timelineReducer.ts`、`timelineDisplay.ts`、`ChatSystemAlert.tsx` 或新增 ContextCompact row。 |
| [ ] | TODO-09 | P2 | 已接入但有差距 | request 消息变体 | `request.*` 已归类，但 steer/remember/learn 等请求没有 Web 的专用图标、标签和消息样式。 | `TimelineRow.tsx` 的 `messageVariant`、SteerIcon、command label | 归一并持久化 message variant；steer、remember、learn 使用明确图标/命令标签；普通 request 保持现状；实时和 history replay 样式一致。 | `chatEventProtocol.ts`、timeline message 类型、`ChatTimelineList.tsx`；需兼容未知 request 子类型。 |
| [x] | TODO-10 | P2 | 未接入专用渲染 | Markdown Mermaid | 当前只按普通代码块显示。 | `MarkdownMermaid.tsx`、`markdown-code/index.tsx` | `mermaid/mmd/mermind` fence 可渲染图；流式未闭合时不报错；支持失败回退、源码查看/复制、缩放或适合移动端的查看方式；深浅主题可读。 | `ConversationMarkdownRenderer.tsx`；若引入依赖只改 `package.json`，由用户手动安装。SVG/HTML 输出必须安全处理。 |
| [x] | TODO-11 | P2 | 未接入专用渲染 | Markdown ECharts | 当前只按普通代码块显示。 | `MarkdownECharts.tsx`、`markdown-code/index.tsx` | `echart/echarts` fence 解析并渲染；非法 JSON、流式未完成和运行异常回退到源码；图表响应容器宽度，深浅主题正确，离屏时释放实例。 | `ConversationMarkdownRenderer.tsx`；依赖规则同 TODO-10。 |
| [x] | TODO-12 | P2 | 未接入专用渲染 | Markdown HTML 预览 | 当前 HTML 仅作为代码显示/复制，没有 Web 的预览入口。 | `markdown-code/index.tsx` 的 HTML preview | HTML fence 提供显式“预览”操作；预览在隔离 WebView/独立预览层打开；默认不自动执行；外链、导航、消息桥接和下载权限受限；退出后释放临时资源。 | Markdown code renderer、新增安全 Preview 组件；必须有恶意脚本/外链降级测试。 |
| [ ] | TODO-13 | P2 | 已接入但有差距 | Markdown resource / workspace 文件链接 | 当前 Markdown 链接是普通链接，没有 Web 的资源下载与 workspace 文件预览路由。 | `MarkdownContent.tsx`、`ContentBlock.tsx` 的 workspace link handler | 识别约定 resource/workspace link；经认证 API 获取；支持文件名、行号定位、预览和下载；普通 http(s) 链接仍走外部打开；非法路径或缺 agent scope 时安全失败。 | `ConversationMarkdownRenderer.tsx` 仅暴露回调，chat feature 负责路由和 service；不得把认证逻辑放进 shared。 |
| [ ] | TODO-14 | P2 | 已接入但有差距 | 用户附件预览 / 下载 | 当前 `ChatAttachmentStrip` 主要展示附件状态和摘要，详情消息里的打开、预览、下载能力弱于 Web。 | `AttachmentCard.tsx`、`attachmentPreview.ts` | 图片可查看大图；文本/常见文档进入预览；其他格式可下载或外部打开；上传中、失败、过期 URL、权限失败均有反馈；多个附件布局可用。 | `ChatAttachmentStrip.tsx`、消息附件 row、feature preview 层和资源 service。 |
| [ ] | TODO-15 | P2 | 已接入但有差距 | tool 结果深层结构化展示 | 已接 tool/tool-group，但 JSON renderer 偏浅，复杂嵌套参数/结果阅读性和代码结果识别弱于 Web。 | `ToolPill.tsx` 及 tool result renderer | 对象/数组可递归展开，设最大深度和节点数；长文本可折叠/复制；代码/补丁/错误结果用对应样式；超大 payload 不阻塞列表；密码/token 等敏感字段继续遮罩。 | `runtimePayloadDescriptor.ts`、`runtimePayloadRenderers.tsx`；增加深层、循环防护、超大数据测试。 |
| [ ] | TODO-16 | P2 | 已接入但有差距 | awaiting 选项 `previewHtml` | timeline 已解析并参与 signature，但 question/plan 选项 UI 没有渲染 HTML 预览。 | `AwaitingAnswerBlock.tsx` 的 option preview | 带 `previewHtml` 的选项显示预览入口或受限内嵌预览；切换选项时内容同步；提交值不受预览影响；无预览保持原布局；恶意 HTML 安全降级。 | `ChatAwaitingDock.tsx` / question state；可复用 TODO-12 的安全预览层。 |
| [ ] | TODO-17 | P2 | 已接入但有差距 | run 过程分组与折叠 | 当前有 run footer 和 runtime rows，但长过程缺少 Web 的 process group / collapse，工具、thinking、planning 容易淹没最终回答。 | `ConversationStage.tsx`、timeline display 的 process grouping | 同一 run 的中间过程稳定分组；运行中默认可见关键进度，完成后可折叠；错误/awaiting 不被错误隐藏；折叠不影响虚拟列表定位和历史回放。 | `timelineDisplay.ts`、`ChatTimelineList.tsx`；需要显示模型的纯函数测试和长列表测试。 |
| [ ] | TODO-18 | P3 | 已接入但有差距 | 完整 transcript 复制 | 当前主要复制单条回答，没有一键复制该 run 的完整可读记录。 | Web run/process footer 的 transcript copy | 可复制当前 run 的用户输入、最终回答及可选过程摘要；默认排除原始内部 JSON 和敏感字段；复制内容顺序稳定，并有成功/失败反馈。 | assistant footer、timeline selector/helper；依赖 TODO-17 的 run 分组会更清晰，但可独立实现。 |
| [ ] | TODO-19 | P3 | 已接入但有差距 | 回答 downvote / 反馈 | 当前没有与 Web 对齐的负反馈入口。 | Web assistant/run footer feedback action | 只在可反馈的已完成回答显示；防重复提交；loading/success/error 可见；请求经 core API/service；离线或接口不支持时不显示或明确降级。 | assistant footer、core API、service；先确认服务端反馈接口和 payload。 |
| [ ] | TODO-20 | P3 | 已接入但有差距 | Derive chat / 从回答派生对话 | 当前没有派生入口。 | Web assistant/run footer derive action | 从指定回答创建新会话并保留必要上下文；成功后导航到新会话；失败可重试；不得在 screen 直接写 SQLite 或直接发 WS；目录快照按既有链路刷新。 | assistant footer、`chatSyncService` / repository / navigation；先确认服务端派生协议。 |
| [ ] | TODO-21 | P3 | 已接入但有差距 | 主动 Compact 操作 | 当前能展示 compact usage，但没有从 usage/header 发起压缩的操作。 | Web compact action / composer command | 达到条件时可发起 compact；进行中禁用重复触发；成功后 timeline 和 usage 同步；失败可恢复；提交走现有发送/service 边界。 | `ChatUsageHeaderBadge.tsx`、controller、`chatSyncService`；先确认使用命令还是专用协议。 |
| [ ] | TODO-22 | P3 | 已接入但有差距 | 首 token 延迟 / 输出速度 | 当前 usage 主要展示 token 与费用类统计，缺 Web 的 latency 和 tokens/s 指标。 | Web run usage metrics | 仅在服务端数据存在时显示首 token 延迟和输出速度；单位、精度和缺省态统一；实时完成后与 replay 一致；不得用不可靠的本地时间伪造服务端指标。 | usage normalization、`ChatUsageHeaderBadge.tsx`、projector；补缺字段和异常值测试。 |
| [ ] | TODO-23 | P3 | 未接入专用渲染 | `tts-voice` fence | 当前当普通代码块/文本展示，没有语音块状态、播放和重播。 | `contentSegments.ts`、`ContentBlock.tsx`、voice runtime | 识别流式和闭合 fence；功能开关关闭时不污染正文；开启时显示状态、展开文本、播放/重播、错误；切换会话和卸载时停止播放；snapshot/replay 不重复触发。 | content segment 模型、voice service/runtime、Content row；建议在 TODO-02 的 segment 基础完成后实施。 |

## 推荐执行顺序

1. `TODO-01`：先补完全缺失的事件类型，验证新增 timeline kind 的完整模板。
2. `TODO-02` → `TODO-03`：建立安全的内容 viewport 与 frontend tool 基础设施。
3. `TODO-04` → `TODO-06`：补齐 artifact、plan、task 三类核心结构化内容。
4. `TODO-07` → `TODO-09`：补 action、context、request 的事件语义。
5. `TODO-10` → `TODO-16`：补 Markdown、资源、附件、tool 和 awaiting 的内容体验。
6. `TODO-17` → `TODO-23`：补 run 操作、usage 指标和 TTS 辅助能力。

## 单项完成检查表

每完成一个 TODO，把下面检查结果写入该项的完成记录：

- [ ] 协议分类覆盖实时 push 和 `/api/chat` history replay。
- [ ] timeline reducer 对重复、乱序、增量事件保持幂等。
- [ ] rich snapshot 序列化/反序列化后渲染不降级。
- [ ] display 层不会重复插入、错误过滤或打乱节点顺序。
- [ ] UI 有 loading、empty、error、unknown payload 降级。
- [ ] 交互提交继续通过 service/repository 边界。
- [ ] 中英文文案、深浅主题、窄屏和长内容已检查。
- [ ] 聚焦测试、`pnpm typecheck`、`pnpm test`、`xgraph status` 通过。
- [ ] 如改变模块职责、公共入口或运行链路，已同步 `.doc/curated` 并运行 `xgraph index`。

## 完成记录

| TODO ID | 完成日期 | 主要变更 | 验证结果 | 备注 |
| --- | --- | --- | --- | --- |
| TODO-01 | 2026-07-18 | `source.publish` 协议分类、结构化 source/chunk 归一、幂等/乱序/reconcile 合并、rich snapshot/history replay、分页展开 Source row 与空结果/异常/畸形数据降级 | 聚焦测试 114/114、typecheck、lint（0 error，2 条既有 warning）、全量 test 381/381、三平台 export build、`xgraph status` 通过 | 未新增依赖或数据库表；source 不写入 legacy runtimeState，避免重复状态与重复渲染 |
| TODO-02 | 2026-07-18 | 单一 append-only fence tokenizer extension、消息 viewport 混排、共用 HTML document LRU/single-flight service、离线 sandbox runtime initialData/resize、loading/error/刷新与 180～380 高度边界 | 聚焦测试 32/32、typecheck、lint（0 error，2 条既有 warning）、全量 test 387/387、三平台 export build、`xgraph status` 通过 | segment 从 timeline 已持久化正文确定性派生，不新增 SQLite schema 或第二份状态；awaiting form 复用同一 HTML 缓存 |
| TODO-03 | 2026-07-18 | tool 节点 frontend 元数据/增量参数归一、active selector 与本地 resolution、共享 viewport document hook、安全 `tool_init`/`frontend_submit`/close/done bridge、owner 复核与 `/api/submit` single-flight、加载/重试/超时/切换会话收口 | 聚焦测试 98/98、typecheck、lint（0 error，2 条既有 warning）、全量 test 393/393、三平台 export build、`xgraph status` 通过 | active tool 从既有 timeline 派生，不新增第二份 store；HTML 用户文档不持有 App bridge/capability token，提交前后复核 conversation/tool/run/toolId；未新增依赖或 SQLite schema |
| TODO-04 | 2026-07-18 | `artifact.publish` 数组/单项协议归一、typed artifact 稳定实体、认证资源预览/下载、图片/文本/PDF/未知格式策略、专用 Artifact row 与 snapshot/replay | 聚焦测试、typecheck、lint、全量 test、三平台 export build、`xgraph status` 通过 | 资源访问统一走 authenticated resource source；HTML artifact 仅作有界文本预览，不执行脚本 |
| TODO-05 | 2026-07-18 | `plan.*` typed plan/step 归一、稳定 planId 幂等归并、步骤进度/耗时/失败专用行、旧 snapshot 迁移、非尾部 structured item 引用稳定更新 | 聚焦测试 40/40、typecheck、聚焦 lint、全量 test 407/407、三平台 export build、`xgraph status` 通过 | 活动耗时只在可见行局部更新；plan 不再经过通用 record renderer，未新增第二份 plan store |
| TODO-06 | 2026-07-18 | `task.*` typed 单一实体、plan/parent/run/group/agent 关系、parallel/父子稳定组合、Plan/standalone 共用任务内容行、旧 snapshot 迁移与结构变化行引用复用 | task 专测 8/8、聚焦测试 132/132、typecheck、lint（0 error，2 条既有 warning）、全量 test 415/415、三平台 export build、`xgraph status` 通过 | task runtime 不复制进 plan 或组件 store；跨中间内容节点仍按 parallel group 聚合，活动耗时只在可见行局部更新 |
| TODO-07 | 2026-07-18 | `action.start/args/end/snapshot/result/fail` typed 归一、actionId/seq/signature 幂等、动作/目标/状态/参数/结果专用行、旧 snapshot 迁移；移动端白名单仅启用 `switch_theme`，`launch_fireworks` 与未知动作只展示拒绝原因；实时 scoped event 通过 128 项有界 single-flight service 执行并回写结果 | action 专测 7/7、聚焦测试 139/139、typecheck、lint（0 error，2 条既有 warning）、全量 test 422/422、三平台 export build、`xgraph status` 通过 | reducer/display/history/snapshot 均不执行副作用；详情页不扫描 timeline，history hydration 不发可执行事件；执行前后按 conversationId/actionId/actionName/policy 复核，未新增依赖或 SQLite schema |
| TODO-10 | 2026-07-17 | 统一 fence segment、Mermaid 离线 sandbox runtime、源码折叠/复制、缩放/重置/平移、可见性与高度缓存 | 聚焦测试 10/10、typecheck、lint、三平台 export build 与 Web 三类 runtime smoke 通过；全量 test 337/340，3 项为既有 Worklets patch/node_modules 基线不一致 | 只修改 `package.json` 依赖声明，未修改 lock；需手动安装依赖 |
| TODO-11 | 2026-07-17 | ECharts 离线 sandbox runtime、PC JavaScript option/function 兼容、resize/dispose、错误重试 | 同 TODO-10 | `Function` 仅存在于 opaque-origin 内层 sandbox runtime |
| TODO-12 | 2026-07-17 | HTML 默认源码展开、显式独立预览层、CSP/sandbox/bridge/导航限制 | 同 TODO-10 | HTML 允许内联脚本，禁止外部网络和 App bridge |
